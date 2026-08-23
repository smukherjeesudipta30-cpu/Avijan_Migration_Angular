import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';

import { ExpenseReport } from '../../../core/models/report.model';
import { ReportService } from '../../../core/services/report.service';
import { downloadCsv, reportFileName, startOfMonth, toIsoDate } from '../report-utils';

/**
 * Institute expenses for a date range. Replaces
 * `Views/Expense/ExpenseReport.cshtml` + `ExpenseReportController`.
 */
@Component({
  selector: 'app-expenses-report',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    InputTextModule,
    TableModule
  ],
  templateUrl: './expenses-report.component.html',
  styleUrl: './expenses-report.component.scss'
})
export class ExpensesReportComponent {
  private readonly reports = inject(ReportService);

  readonly report = signal<ExpenseReport | null>(null);
  readonly loading = signal(false);

  readonly from = signal<Date>(startOfMonth());
  readonly to = signal<Date>(new Date());
  readonly search = signal('');

  readonly page = signal(1);
  readonly pageSize = signal(25);

  constructor() {
    this.run();
  }

  run(resetPage = true): void {
    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());

    if (!from || !to) return;

    if (resetPage) this.page.set(1);
    this.loading.set(true);

    this.reports
      .expenses(from, to, this.page(), this.pageSize(), this.search().trim() || null)
      .subscribe({
        next: report => {
          this.report.set(report);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.pageSize();
    const first = event.first ?? 0;

    this.pageSize.set(size);
    this.page.set(Math.floor(first / size) + 1);
    this.run(false);
  }

  exportCsv(): void {
    const report = this.report();
    if (!report) return;

    this.reports
      .expenses(
        toIsoDate(this.from())!,
        toIsoDate(this.to())!,
        1,
        Math.max(report.entryCount, 1),
        this.search().trim() || null
      )
      .subscribe(full => {
        downloadCsv(
          reportFileName('expenses'),
          ['Date', 'Details', 'Amount'],
          full.rows.items.map(r => [r.expenseDate, r.details, r.amount])
        );
      });
  }
}
