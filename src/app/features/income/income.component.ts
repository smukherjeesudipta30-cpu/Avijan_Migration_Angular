import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
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
import { formatMoney } from '../../core/format/money';
import { BranchListItem } from '../../core/models/master.model';
import { IncomeService } from '../../core/services/income.service';
import { MasterService } from '../../core/services/master.service';
import { AboutService } from '../../core/services/about.service';
import { ContactDetails } from '../../core/models/about.model';
import { incomeSectionDocumentHtml } from '../../core/printing/income-section-document';
import { incomeSummaryDocumentHtml } from '../../core/printing/income-summary-document';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../core/printing/legacy-documents';

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
    SelectModule,
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
  private readonly masters = inject(MasterService);
  private readonly about = inject(AboutService);
  private readonly messages = inject(MessageService);

  readonly report = signal<IncomeReport | null>(null);
  readonly loading = signal(false);

  /** Scopes every figure to one branch. Null is the whole institute. */
  readonly branch = signal<string | null>(null);

  readonly branches = signal<BranchListItem[]>([]);

  readonly detail = signal<IncomeDetail[]>([]);

  /** True while the per-tab sheet is being assembled. */
  readonly pdfBusy = signal(false);

  /** True while the full statement is being assembled. */
  readonly summaryBusy = signal(false);
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

  /**
   * Whatever the server called the proprietor's line in this report — the
   * Receptionist's copy names it "Administrative expenses", so the page never
   * spells it out itself.
   */
  readonly honorariumLabel = computed(() => {
    const s = (this.report()?.sections ?? [])
      .find(x => x.section === 'ProprietorHonorarium' || x.section === 'AdministrativeExpenses');
    return (s?.label ?? 'Administrative expenses').toLowerCase();
  });

  /** Income sections shown above the cost ones, breakdowns last. */
  readonly incomeSections = computed(() =>
    (this.report()?.sections ?? []).filter(s => !s.isCost && !s.isBreakdown));

  readonly costSections = computed(() =>
    (this.report()?.sections ?? []).filter(s => s.isCost));

  /* The cost card lists these two groups separately, and it matters that it does.
     "Paid to teachers" is a cost section but a breakdown one, so it is NOT part of
     Total cost - the teacher's share is counted once, when it is earned, and the
     cash handed over later settles that rather than adding to it.

     Listed together and styled alike, the card did not add up: four lines summing
     to Rs 8,08,507 under a total of Rs 5,35,847, with nothing to say which line
     was not in it. Splitting them is what makes the total checkable by eye. */
  readonly countedCostSections = computed(() =>
    (this.report()?.sections ?? []).filter(s => s.isCost && !s.isBreakdown));

  readonly informationalCostSections = computed(() =>
    (this.report()?.sections ?? []).filter(s => s.isCost && s.isBreakdown));

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

    this.masters.branches().subscribe({
      next: rows => this.branches.set(rows.filter(b => b.isActive))
    });
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

    this.income.report(from, to, this.branch()).subscribe({
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
      .detail(this.activeSection(), data.from, data.to, this.detailPage(), this.detailPageSize(), this.branch())
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

  /**
   * Prints the whole report - income, expenditure, net and the period-by-period
   * movement behind it - as one letterheaded statement.
   *
   * Needs no extra rows: every figure is already in the report on screen, so
   * this opens immediately and can never disagree with what the user is
   * looking at.
   */
  downloadSummaryPdf(): void {
    const data = this.report();
    if (!data) return;

    this.summaryBusy.set(true);

    const win = openPendingDocumentWindow();

    this.about.getAboutPage().subscribe({
      next: page => this.openSummary(data, page.contact, win),
      error: () => this.openSummary(data, null, win)
    });
  }

  private openSummary(data: IncomeReport, contact: ContactDetails | null, win: Window | null): void {
    this.summaryBusy.set(false);

    if (!writeDocumentWindow(win, incomeSummaryDocumentHtml(data, contact))) {
      this.messages.add({
        severity: 'warn', summary: 'Pop-up blocked',
        detail: 'Allow pop-ups for this site, then try again.', life: 6000
      });
    }
  }

  /**
   * Prints the active tab as a letterheaded A4 sheet, for a bank or auditor.
   *
   * Fetches EVERY row in the section rather than the twenty-five on screen -
   * a statement that silently showed one page would be worse than none. The
   * cap exists so a five-year range cannot try to render fifty thousand rows
   * into a popup; the sheet says when it has been applied.
   */
  downloadPdf(): void {
    const data = this.report();
    const section = this.activeSectionTotal();

    if (!data || !section || section.rowCount === 0) {
      this.messages.add({
        severity: 'info', summary: 'Nothing to print',
        detail: 'This section has no entries for the selected period.', life: 4000
      });
      return;
    }

    const cap = 3000;
    this.pdfBusy.set(true);

    const win = openPendingDocumentWindow();

    /* The letterhead comes from the API so the address cannot drift out of
       step with the public site. A failure to fetch it is not worth losing
       the document over - the sheet falls back to the registered address. */
    this.about.getAboutPage().subscribe({
      next: page => this.renderPdf(data, section, page.contact, cap, win),
      error: () => this.renderPdf(data, section, null, cap, win)
    });
  }

  /**
   * Collects every row of the section, a page at a time.
   *
   * The API caps a page at 200 rows and that cap is global — it guards every
   * paged endpoint, so asking for 3,000 silently returns 200 and a document
   * built from that would look complete while showing a fifth of the entries.
   * Paging here gets the whole section without weakening the server's limit.
   */
  private renderPdf(
    data: IncomeReport,
    section: IncomeSectionTotal,
    contact: ContactDetails | null,
    cap: number,
    win: Window | null
  ): void {
    const serverPage = 200;
    const collected: IncomeDetail[] = [];

    const fetchPage = (page: number): void => {
      this.income
        .detail(this.activeSection(), data.from, data.to, page, serverPage, this.branch())
        .subscribe({
          next: result => {
            collected.push(...result.items);

            const more = collected.length < result.totalCount
                         && result.items.length > 0
                         && collected.length < cap;

            if (more) {
              fetchPage(page + 1);
              return;
            }

            this.pdfBusy.set(false);
            this.openSheet(data, section, contact, collected, result.totalCount, win);
          },
          error: () => {
            this.pdfBusy.set(false);
            win?.close();
          }
        });
    };

    fetchPage(1);
  }

  private openSheet(
    data: IncomeReport,
    section: IncomeSectionTotal,
    contact: ContactDetails | null,
    rows: IncomeDetail[],
    totalCount: number,
    win: Window | null
  ): void {
    const opened = writeDocumentWindow(win, incomeSectionDocumentHtml({
      sectionLabel: section.label,
      from: data.from,
      to: data.to,
      branch: this.branch(),
      total: section.amount,
      rowCount: section.rowCount,
      rows,
      truncated: totalCount > rows.length,
      contact
    }));

    if (!opened) {
      this.messages.add({
        severity: 'warn',
        summary: 'Pop-up blocked',
        detail: 'Allow pop-ups for this site, then try again.',
        life: 6000
      });
    }
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
    return formatMoney(value);
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
