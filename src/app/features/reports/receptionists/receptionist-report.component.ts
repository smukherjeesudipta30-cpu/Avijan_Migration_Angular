import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';

import { formatMoney } from '../../../core/format/money';
import { ReceptionistReport } from '../../../core/models/receptionist.model';
import { ReceptionistService } from '../../../core/services/receptionist.service';
import { downloadCsv, reportFileName } from '../report-utils';

/**
 * What each branch paid its receptionists, month by month.
 *
 * A receptionist's pay is a fixed monthly amount rather than a share of fees, so
 * this reads as a grid of months rather than a ledger of transactions — and every
 * payment carries the branch it was made at, copied at the time, so moving someone
 * between branches never rewrites what a branch spent last year.
 */
@Component({
  selector: 'app-receptionist-report',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    TableModule
  ],
  templateUrl: './receptionist-report.component.html',
  styleUrl: './receptionist-report.component.scss'
})
export class ReceptionistReportComponent {
  private readonly service = inject(ReceptionistService);

  readonly data = signal<ReceptionistReport | null>(null);
  readonly loading = signal(false);

  readonly branch = signal<string | null>(null);
  readonly from = signal<Date>(new Date(new Date().getFullYear(), 0, 1));
  readonly to = signal<Date>(new Date());

  readonly branchOptions = computed(() =>
    (this.data()?.branches ?? []).map(b => ({ label: b, value: b })));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.service
      .report(this.toIsoDate(this.from()), this.toIsoDate(this.to()), this.branch())
      .subscribe({
        next: report => {
          this.data.set(report);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  exportCsv(): void {
    const report = this.data();
    if (!report) return;

    downloadCsv(
      reportFileName('receptionist-pay'),
      ['Branch', 'Month', 'Receptionist', 'Amount'],
      report.rows.map(r => [r.branch, r.periodLabel, r.receptionistName, r.amount])
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
