import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { formatMoney } from '../../../core/format/money';
import { BranchGrouping, BranchReport } from '../../../core/models/report.model';
import { ReportService } from '../../../core/services/report.service';
import { downloadCsv, reportFileName } from '../report-utils';

/**
 * Admissions, fee payments and expenses by branch, bucketed by month, quarter or
 * year.
 *
 * The three measures reach a branch by different routes — an admission and a
 * payment through the student's branch, an expense through the branch on the
 * expense row — so anything without one is reported as *Unassigned* rather than
 * dropped. That keeps these totals reconcilable against the admissions, income
 * and expense reports, which count everything.
 */
@Component({
  selector: 'app-branch-report',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule
  ],
  templateUrl: './branch-report.component.html',
  styleUrl: './branch-report.component.scss'
})
export class BranchReportComponent {
  private readonly reports = inject(ReportService);

  readonly data = signal<BranchReport | null>(null);
  readonly loading = signal(false);

  readonly groupings: { label: string; value: BranchGrouping }[] = [
    { label: 'Month', value: 'Month' },
    { label: 'Quarter', value: 'Quarter' },
    { label: 'Year', value: 'Year' }
  ];

  readonly groupBy = signal<BranchGrouping>('Month');
  readonly branch = signal<string | null>(null);

  /** Defaults to the current financial-ish year so the page opens with content. */
  readonly from = signal<Date>(new Date(new Date().getFullYear(), 0, 1));
  readonly to = signal<Date>(new Date());

  readonly branchOptions = computed(() =>
    (this.data()?.branches ?? []).map(b => ({ label: b, value: b })));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.reports
      .branchReport(
        this.toIsoDate(this.from()),
        this.toIsoDate(this.to()),
        this.groupBy(),
        this.branch()
      )
      .subscribe({
        next: report => {
          this.data.set(report);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  setGrouping(value: BranchGrouping): void {
    this.groupBy.set(value);
    this.load();
  }

  clearBranch(): void {
    this.branch.set(null);
    this.load();
  }

  exportCsv(): void {
    const report = this.data();
    if (!report) return;

    downloadCsv(
      reportFileName(`branch-${report.groupBy.toLowerCase()}`),
      [
        'Branch', 'Period', 'Admissions', 'Admission fees',
        'Payments', 'Fees collected', 'Late fines', 'Expenses', 'Net'
      ],
      report.rows.map(r => [
        r.branch, r.periodLabel, r.admissions, r.admissionFees,
        r.payments, r.feesCollected, r.lateFines, r.expenses, r.net
      ])
    );
  }

  money(value?: number | null): string {
    return formatMoney(value);
  }

  private toIsoDate(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }
}
