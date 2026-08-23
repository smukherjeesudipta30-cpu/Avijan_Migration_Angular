import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import {
  IncomeDetail,
  IncomeReport,
  IncomeSection,
  IncomeSectionTotal
} from '../../core/models/income.model';
import { IncomeService } from '../../core/services/income.service';

/**
 * Income report — the migration of `Views/Income/Index.cshtml` and
 * `Scripts/Income.js`.
 *
 * The legacy page had seven independent date ranges, one per panel, each with its
 * own running total and no consolidated figure; the operator added them up by hand.
 * Here one range drives everything and the server returns the profit and loss.
 */
@Component({
  selector: 'app-income',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ChartModule,
    DatePickerModule,
    MessageModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    TooltipModule
  ],
  templateUrl: './income.component.html',
  styleUrl: './income.component.scss'
})
export class IncomeComponent {
  private readonly income = inject(IncomeService);
  private readonly messages = inject(MessageService);

  readonly report = signal<IncomeReport | null>(null);
  readonly loading = signal(false);

  readonly detail = signal<IncomeDetail[]>([]);
  readonly detailTotal = signal(0);
  readonly detailLoading = signal(false);
  readonly activeSection = signal<IncomeSection>('Fees');
  readonly detailPage = signal(1);
  readonly detailPageSize = signal(25);

  readonly from = signal<Date>(this.startOfYear());
  readonly to = signal<Date>(new Date());

  readonly today = new Date();

  /** Quick ranges, so the common cases are one click. */
  readonly presets = [
    { label: 'This month', value: 'month' },
    { label: 'This year', value: 'year' },
    { label: 'Last 12 months', value: '12m' },
    { label: 'All time', value: 'all' }
  ];

  /** Income sections shown above the cost ones, breakdowns last. */
  readonly incomeSections = computed(() =>
    (this.report()?.sections ?? []).filter(s => !s.isCost && !s.isBreakdown));

  readonly costSections = computed(() =>
    (this.report()?.sections ?? []).filter(s => s.isCost));

  readonly breakdownSections = computed(() =>
    (this.report()?.sections ?? []).filter(s => s.isBreakdown));

  readonly isProfit = computed(() => (this.report()?.netProfit ?? 0) >= 0);

  /** Section tabs for the detail table, each carrying its own total. */
  readonly sectionTabs = computed(() =>
    (this.report()?.sections ?? []).map(s => ({
      label: s.label,
      value: s.section,
      rowCount: s.rowCount,
      amount: s.amount,
      isCost: s.isCost,
      isBreakdown: s.isBreakdown
    })));

  /** The whole-range total for the tab currently open. */
  readonly activeSectionTotal = computed<IncomeSectionTotal | null>(() =>
    (this.report()?.sections ?? []).find(s => s.section === this.activeSection()) ?? null);

  /** Sum of the rows on screen — differs from the section total when paged. */
  readonly visiblePageTotal = computed(() =>
    this.detail().reduce((sum, row) => sum + (row.amount ?? 0), 0));

  /** True when the page shown is only part of the section. */
  readonly isPartialPage = computed(() =>
    this.detailTotal() > this.detail().length);


  readonly trendChart = computed(() => {
    const data = this.report();
    if (!data || data.monthly.length === 0) {
      return null;
    }

    return {
      labels: data.monthly.map(p => `${p.label} ${String(p.year).slice(2)}`),
      datasets: [
        {
          type: 'bar',
          label: 'Income',
          data: data.monthly.map(p => p.income),
          backgroundColor: 'rgba(109, 40, 217, 0.75)',
          borderRadius: 4
        },
        {
          type: 'bar',
          label: 'Cost',
          data: data.monthly.map(p => p.cost),
          backgroundColor: 'rgba(14, 165, 233, 0.75)',
          borderRadius: 4
        },
        {
          type: 'line',
          label: 'Net',
          data: data.monthly.map(p => p.net),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22, 163, 74, 0.1)',
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 3,
          fill: false
        }
      ]
    };
  });

  readonly trendOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { usePointStyle: true, boxWidth: 8, padding: 16 } },
      tooltip: { mode: 'index' as const, intersect: false }
    },
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { maxTicksLimit: 6 }, grid: { color: 'rgba(0,0,0,0.05)' } }
    }
  };

  constructor() {
    this.run();
  }

  /* --------------------------------------------------------------- run */
  run(): void {
    const from = this.toIsoDate(this.from());
    const to = this.toIsoDate(this.to());

    if (!from || !to) return;

    if (this.from() > this.to()) {
      this.messages.add({
        severity: 'warn',
        summary: 'Check the dates',
        detail: 'The "from" date is after the "to" date.',
        life: 5000
      });
      return;
    }

    this.loading.set(true);

    this.income.report(from, to).subscribe({
      next: data => {
        this.report.set(data);
        this.loading.set(false);
        this.detailPage.set(1);
        this.loadDetail();
      },
      error: () => {
        this.loading.set(false);
        this.report.set(null);
      }
    });
  }

  applyPreset(preset: string): void {
    const now = new Date();

    switch (preset) {
      case 'month':
        this.from.set(new Date(now.getFullYear(), now.getMonth(), 1));
        this.to.set(now);
        break;
      case 'year':
        this.from.set(this.startOfYear());
        this.to.set(now);
        break;
      case '12m': {
        const start = new Date(now);
        start.setMonth(start.getMonth() - 11);
        start.setDate(1);
        this.from.set(start);
        this.to.set(now);
        break;
      }
      case 'all':
        // Well before the earliest record in the migrated data (2018).
        this.from.set(new Date(2015, 0, 1));
        this.to.set(now);
        break;
    }

    this.run();
  }

  /* ------------------------------------------------------------ detail */
  selectSection(section: IncomeSection): void {
    this.activeSection.set(section);
    this.detailPage.set(1);
    this.loadDetail();
  }

  loadDetail(): void {
    const data = this.report();
    if (!data) return;

    this.detailLoading.set(true);

    this.income
      .detail(this.activeSection(), data.from, data.to, this.detailPage(), this.detailPageSize())
      .subscribe({
        next: result => {
          this.detail.set(result.items);
          this.detailTotal.set(result.totalCount);
          this.detailLoading.set(false);
        },
        error: () => this.detailLoading.set(false)
      });
  }

  onDetailLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.detailPageSize();
    const first = event.first ?? 0;

    this.detailPageSize.set(size);
    this.detailPage.set(Math.floor(first / size) + 1);
    this.loadDetail();
  }

  /** Downloads the visible detail rows as CSV. */
  exportCsv(): void {
    const rows = this.detail();
    if (rows.length === 0) return;

    const header = ['Date', 'Reference', 'Student', 'Registration', 'Course', 'Teacher', 'Description', 'Amount'];

    const escape = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const body = rows.map(r =>
      [r.date ?? '', r.reference ?? '', r.studentName ?? '', r.registrationId ?? '',
       r.courseName ?? '', r.teacherName ?? '', r.description ?? '', r.amount]
        .map(escape).join(','));

    const csv = [header.join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `income-${this.activeSection()}-${this.report()?.from}-to-${this.report()?.to}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  /* ----------------------------------------------------------- helpers */
  money(value?: number | null): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value ?? 0);
  }

  sectionOf(total: IncomeSectionTotal): IncomeSection {
    return total.section;
  }

  private startOfYear(): Date {
    return new Date(new Date().getFullYear(), 0, 1);
  }

  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }
}
