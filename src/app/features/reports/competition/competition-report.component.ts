import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { CompetitionReport, CompetitionReportRow } from '../../../core/models/competition.model';
import { AuthService } from '../../../core/services/auth.service';
import { CompetitionService } from '../../../core/services/competition.service';
import { downloadCsv, reportFileName } from '../report-utils';

/**
 * Year-wise register of everyone entered for the Drawing &amp; Dance competition.
 *
 * <p>Admin, Receptionist and the Editor account — the role the owner asked to be
 * given to Arkita Nath, who runs the programme section. Confirming a payment is
 * narrower still: only Admin and Receptionist, because it is a statement that money
 * has been seen in the account.</p>
 */
@Component({
  selector: 'app-competition-report',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, TableModule, TagModule],
  templateUrl: './competition-report.component.html',
  styleUrls: ['../report.shared.scss', './competition-report.component.scss']
})
export class CompetitionReportComponent implements OnInit, OnDestroy {
  private readonly competitions = inject(CompetitionService);
  private readonly auth = inject(AuthService);

  readonly report = signal<CompetitionReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly working = signal<Set<number>>(new Set());

  readonly year = signal<number | null>(null);
  readonly kind = signal<string | null>(null);
  readonly status = signal<string | null>(null);
  readonly search = signal('');

  /** Confirming money is for the desk and the administrator, not the programme editor. */
  readonly mayConfirm = computed(() => this.auth.hasAnyRole(['Admin', 'Receptionist']));

  /** Cancelling refunds money, so it is the administrator's decision alone. */
  readonly mayCancel = computed(() => this.auth.hasAnyRole(['Admin']));

  readonly kindOptions = [
    { label: 'Both competitions', value: null },
    { label: 'Drawing', value: 'Drawing' },
    { label: 'Dance', value: 'Dance' }
  ];

  readonly statusOptions = [
    { label: 'Any status', value: null },
    { label: 'Cancelled', value: 'Cancelled' },
    { label: 'Payment pending', value: 'Pending' },
    { label: 'Confirmed', value: 'Confirmed' },
    { label: 'Paying at venue', value: 'AtVenue' },
    { label: 'Rejected', value: 'Rejected' }
  ];

  /** Object URLs for documents opened in this session, released on the way out. */
  private readonly opened: string[] = [];

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    for (const url of this.opened) URL.revokeObjectURL(url);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);

    this.competitions
      .report(this.year(), this.kind(), this.status(), this.search().trim() || null)
      .subscribe({
        next: report => {
          this.report.set(report);
          this.year.set(report.year);
          this.loading.set(false);
        },
        error: err => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'The report could not be loaded.');
        }
      });
  }

  clear(): void {
    this.kind.set(null);
    this.status.set(null);
    this.search.set('');
    this.load();
  }

  /* ------------------------------------------------------------- payment */

  setStatus(row: CompetitionReportRow, status: string): void {
    this.working.update(set => new Set(set).add(row.applicantId));

    this.competitions.setPaymentStatus(row.applicantId, status).subscribe({
      next: () => {
        this.stopWorking(row.applicantId);
        this.load();
      },
      error: () => this.stopWorking(row.applicantId)
    });
  }

  /**
   * Cancels a registration outright and marks the whole amount refundable.
   *
   * <p>Admin only, and it asks for a reason: a cancellation somebody has to explain
   * at the desk a week later is worth one line of typing now. The dance place and
   * the chest number go back to the group.</p>
   */
  cancel(row: CompetitionReportRow): void {
    const reason = prompt(
      `Cancel ${row.participantName}'s registration and refund Rs ${row.amount}?

Why?`);

    if (!reason || !reason.trim()) return;

    this.working.update(set => new Set(set).add(row.applicantId));

    this.competitions.cancel(row.applicantId, reason.trim()).subscribe({
      next: () => {
        this.stopWorking(row.applicantId);
        this.load();
      },
      error: err => {
        this.stopWorking(row.applicantId);
        this.error.set(err?.error?.message ?? 'That registration could not be cancelled.');
      }
    });
  }

  isWorking(applicantId: number): boolean {
    return this.working().has(applicantId);
  }

  private stopWorking(applicantId: number): void {
    this.working.update(set => {
      const next = new Set(set);
      next.delete(applicantId);
      return next;
    });
  }

  /* ----------------------------------------------------------- documents */

  /**
   * Opens a document in a new tab.
   *
   * <p>Fetched through HttpClient rather than linked directly, because the endpoint
   * is behind the bearer token and a plain link carries no Authorization header.</p>
   */
  openDocument(row: CompetitionReportRow, kind: string): void {
    this.competitions.documentBlob(row.applicantId, kind).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        this.opened.push(url);
        window.open(url, '_blank');
      },
      error: () => this.error.set('That document could not be opened.')
    });
  }

  /* -------------------------------------------------------------- export */

  exportCsv(): void {
    const rows = this.report()?.rows ?? [];
    if (rows.length === 0) return;

    downloadCsv(
      reportFileName(`competition-${this.report()?.year ?? ''}`),
      [
        'S.No',
        'Registration', 'Competition', 'Group', 'Chest no', 'Participant', 'Guardian',
        'Date of birth', 'Age', 'School', 'Class', 'Phone', 'Email',
        'Amount', 'Paid by', 'Status', 'UPI reference', 'Cancelled because',
        'Confirmed by', 'Registered on'
      ],
      rows.map((r, i) => [
        i + 1,
        r.registrationNo,
        r.kind,
        r.groupLabel ?? '',
        r.batchNo ?? '',
        r.participantName,
        r.guardianName ?? '',
        r.dateOfBirth ?? '',
        r.age ?? '',
        r.schoolName ?? '',
        r.className ?? '',
        r.phone,
        r.email ?? '',
        r.amount,
        r.paymentMode === 'Venue' ? 'At venue' : 'Online',
        r.paymentStatus,
        r.transactionRef ?? '',
        r.cancelReason ?? '',
        r.confirmedBy ?? '',
        r.submittedOn
      ])
    );
  }

  /** The chest-number list for the day, in group and number order. */
  print(): void {
    window.print();
  }

  protected statusTone(status: string): 'success' | 'warn' | 'info' | 'danger' {
    switch (status) {
      case 'Confirmed': return 'success';
      case 'AtVenue': return 'info';
      case 'Rejected': return 'danger';
      case 'Cancelled': return 'danger';
      default: return 'warn';
    }
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'AtVenue': return 'Paying at venue';
      case 'Pending': return 'Payment pending';
      case 'Cancelled': return 'Cancelled - refund due';
      default: return status;
    }
  }
}
