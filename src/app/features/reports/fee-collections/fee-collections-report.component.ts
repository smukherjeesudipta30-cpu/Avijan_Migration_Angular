import { CommonModule } from '@angular/common';
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { BranchListItem } from '../../../core/models/master.model';
import { FeeCollectionsReport } from '../../../core/models/report.model';
import { MasterService } from '../../../core/services/master.service';
import { ReportService } from '../../../core/services/report.service';
import { downloadCsv, reportFileName, startOfMonth, toIsoDate } from '../report-utils';

/**
 * Every fee payment in a range — monthly installments and admission fees — with
 * cash-versus-bank and who recorded it, branch-wise.
 *
 * <p>Built for two different readings of the same rows: the payment list itself
 * (which the owner asked to see split online-versus-offline), and the reconciliation
 * totals underneath it, one line per branch/receptionist/mode, which is what a
 * counter is checked against at month end — "who has how many amount at month end".</p>
 */
@Component({
  selector: 'app-fee-collections-report',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    TableModule,
    TagModule
  ],
  templateUrl: './fee-collections-report.component.html',
  styleUrls: ['../report.shared.scss', './fee-collections-report.component.scss']
})
export class FeeCollectionsReportComponent implements OnInit {
  private readonly reports = inject(ReportService);
  private readonly masters = inject(MasterService);

  readonly report = signal<FeeCollectionsReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly branches = signal<BranchListItem[]>([]);

  readonly branch = signal<string | null>(null);
  readonly mode = signal<string | null>(null);
  readonly modes = [
    { label: 'Cash and bank', value: null },
    { label: 'Cash only', value: 'Cash' },
    { label: 'Bank only', value: 'Bank' }
  ];

  /* A month has a hundred-odd monthly rows and a handful of admissions, and in a
     date-sorted list the admissions land on page four. This lets the office pull
     just them out when it is the admission money being reconciled. */
  readonly kind = signal<string | null>(null);
  readonly kinds = [
    { label: 'Monthly and admission', value: null },
    { label: 'Monthly fees only', value: 'Monthly' },
    { label: 'Admission fees only', value: 'Admission' }
  ];

  readonly from = signal<Date>(startOfMonth(new Date()));
  readonly to = signal<Date>(new Date());

  ngOnInit(): void {
    this.masters.branches().subscribe({
      next: data => this.branches.set(data),
      error: () => this.branches.set([])
    });

    this.load();
  }

  load(): void {
    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());

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

    this.reports.feeCollections(from, to, this.branch(), this.mode(), this.kind()).subscribe({
      next: data => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'The report could not be loaded.');
      }
    });
  }

  clear(): void {
    this.branch.set(null);
    this.mode.set(null);
    this.from.set(startOfMonth(new Date()));
    this.to.set(new Date());
    this.load();
  }

  exportCsv(): void {
    const r = this.report();
    if (!r || r.rows.length === 0) return;

    downloadCsv(
      reportFileName('fee-collections'),
      ['S.No', 'Date', 'Kind', 'Registration', 'Student', 'Branch', 'Amount', 'Mode', 'Collected by', 'Bill'],
      r.rows.map((row, i) => [
        i + 1,
        row.paidOn ?? '',
        row.kind,
        row.registrationId ?? '',
        row.studentName ?? '',
        row.branch ?? '',
        row.amount,
        row.paymentMode ?? '',
        row.collectedBy ?? '',
        row.billNo ?? ''
      ])
    );
  }

  exportTotalsCsv(): void {
    const r = this.report();
    if (!r || r.totals.length === 0) return;

    downloadCsv(
      reportFileName('fee-collections-reconciliation'),
      ['S.No', 'Branch', 'Collected by', 'Mode', 'Payments', 'Amount'],
      r.totals.map((t, i) => [i + 1, t.branch, t.collectedBy, t.paymentMode, t.paymentCount, t.amount])
    );
  }
}
