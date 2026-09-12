import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { BranchListItem } from '../../../core/models/master.model';
import { PendingPaymentRow, PendingPaymentsReport } from '../../../core/models/report.model';
import { CourseLookup } from '../../../core/models/student.model';
import { MasterService } from '../../../core/services/master.service';
import { ReportService } from '../../../core/services/report.service';
import { StudentService } from '../../../core/services/student.service';
import { downloadCsv, reportFileName, startOfMonth, toIsoDate } from '../report-utils';

/**
 * Branch-wise pending payments, in two sections.
 *
 * <p>Built for the front desk to work down: who owes money, how much, for how many
 * months, and whose phone number to ring. "Never paid" and "Regular" are kept apart
 * because they are two different conversations — one is a student who enrolled and
 * never came back, the other is a student who has fallen behind.</p>
 */
@Component({
  selector: 'app-pending-payments-report',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    TableModule,
    TagModule
  ],
  templateUrl: './pending-payments-report.component.html',
  styleUrls: ['../report.shared.scss', './pending-payments-report.component.scss']
})
export class PendingPaymentsReportComponent implements OnInit {
  private readonly reports = inject(ReportService);
  private readonly masters = inject(MasterService);
  private readonly students = inject(StudentService);

  readonly report = signal<PendingPaymentsReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly branches = signal<BranchListItem[]>([]);
  readonly courses = signal<CourseLookup[]>([]);

  readonly branch = signal<string | null>(null);
  readonly courseId = signal<number>(0);
  /**
   * The period being checked. Defaults to this month so the page opens on the
   * question the desk asks most often -- who has not paid this month.
   */
  readonly from = signal<Date>(startOfMonth(new Date()));
  readonly to = signal<Date>(new Date());

  /** Which section is on screen. Both are always fetched; this only chooses the view. */
  readonly section = signal<'never' | 'regular'>('never');

  readonly visibleRows = computed<PendingPaymentRow[]>(() => {
    const r = this.report();
    if (!r) return [];
    return this.section() === 'never' ? r.neverPaid : r.regular;
  });

  ngOnInit(): void {
    this.masters.branches().subscribe({
      next: data => this.branches.set(data),
      error: () => this.branches.set([])
    });

    this.students.courses().subscribe({
      next: data => this.courses.set(data),
      error: () => this.courses.set([])
    });

    this.load();
  }

  load(): void {
    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());

    // Both dates are required, so say so here rather than sending a half-filled
    // request and letting the server answer with the same thing.
    if (!from || !to) {
      this.error.set('Choose both the from and to dates.');
      return;
    }

    if (to < from) {
      this.error.set('The "to" date cannot be before the "from" date.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.reports
      .pendingPayments(from, to, this.branch(), this.courseId())
      .subscribe({
        next: data => {
          this.report.set(data);
          this.loading.set(false);
        },
        error: err => {
          this.loading.set(false);
          this.error.set(
            err?.error?.message ?? 'The report could not be loaded.');
        }
      });
  }

  clear(): void {
    this.branch.set(null);
    this.courseId.set(0);
    this.from.set(startOfMonth(new Date()));
    this.to.set(new Date());
    this.load();
  }

  /** Downloads whichever section is on screen, with every column it shows. */
  exportCsv(): void {
    const rows = this.visibleRows();
    if (rows.length === 0) return;

    const label = this.section() === 'never' ? 'never-paid' : 'regular';

    downloadCsv(
      reportFileName(`pending-payments-${label}`),
      [
        'Registration', 'Student', 'Phone', 'Branch', 'Course', 'Teachers',
        'Joined', 'Last payment', 'Monthly fee', 'Months due', 'Carried due',
        'Late fine', 'Total due', 'Admission owing'
      ],
      rows.map(r => [
        r.registrationId ?? '',
        r.studentName ?? '',
        r.phone ?? '',
        r.branch ?? '',
        r.courseName ?? '',
        r.teachers.join('; '),
        r.dateOfJoining ?? '',
        r.lastPaymentDate ?? 'Never',
        r.monthlyFee,
        r.monthsUnpaid,
        r.carriedDue,
        r.lateFine,
        r.outstandingDue,
        r.admissionDue ?? 0
      ])
    );
  }

  protected sectionTotal(rows: PendingPaymentRow[]): number {
    return rows.reduce((sum, r) => sum + r.outstandingDue, 0);
  }
}
