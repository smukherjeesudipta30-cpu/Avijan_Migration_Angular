import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolIncomeReport } from '../../../core/models/preschool-finance.model';
import { monthLabel } from '../../../core/models/preschool-student.model';
import { escapeHtml, openDocumentWindow } from '../../../core/printing/legacy-documents';
import { PreSchoolFinanceService } from '../../../core/services/preschool-finance.service';
import { PreSchoolIncomeRangeComponent } from './preschool-income-range.component';

/**
 * The PreSchool's money for a year, month by month: fees received, salaries
 * paid, other expenses, and what is left. Only PreSchool figures — the
 * Computer Centre's income and expenses are not in it. PreSchool admin only.
 */
@Component({
  selector: 'app-preschool-income',
  standalone: true,
  imports: [ButtonModule, ChartModule, PreSchoolIncomeRangeComponent],
  template: `
    <div class="pin-head">
      <div class="app-page-head">
        <span class="app-eyebrow">Avijan PreSchool · Accounts</span>
        <h1>Income report</h1>
        <p class="app-muted">Fees by the date received, salaries by the date paid, expenses by the date spent. Cancelled receipts are left out.</p>
      </div>
      <p-button label="Year as PDF" icon="pi pi-print" [outlined]="true" [disabled]="!report()" (onClick)="print()" />
    </div>

    <app-preschool-income-range />

    <div class="pin-year">
      <p-button icon="pi pi-chevron-left" [text]="true" [rounded]="true" ariaLabel="Previous year" (onClick)="setYear(year() - 1)" />
      <strong>{{ year() }}</strong>
      <p-button icon="pi pi-chevron-right" [text]="true" [rounded]="true" ariaLabel="Next year" (onClick)="setYear(year() + 1)" />
    </div>

    @if (report(); as r) {
      <div class="pin-kpis">
        <div><span>Fees received</span><strong class="pin-green">{{ money(r.income) }}</strong></div>
        <div><span>Salaries paid</span><strong>{{ money(r.salaries) }}</strong></div>
        <div><span>Other expenses</span><strong>{{ money(r.expenses) }}</strong></div>
        <div><span>Net {{ r.net < 0 ? 'loss' : 'profit' }}</span><strong [class.pin-red]="r.net < 0" [class.pin-green]="r.net >= 0">{{ money(r.net) }}</strong></div>
      </div>

      <div class="app-card pin-chart">
        <h2>Month by month</h2>
        <p-chart type="bar" [data]="chart()" [options]="chartOptions" height="320px" />
      </div>

      <div class="app-card pin-table">
        <div class="pin-row pin-row--head"><span>Month</span><span class="r">Admission</span><span class="r">Monthly fees</span><span class="r">Income</span><span class="r">Salaries</span><span class="r">Expenses</span><span class="r">Net</span></div>
        @for (m of r.months; track m.month) {
          <div class="pin-row" [class.pin-row--empty]="!m.income && !m.salaries && !m.expenses">
            <span>{{ label(m.month) }}</span>
            <span class="r">{{ show(m.admissionFees) }}</span>
            <span class="r">{{ show(m.monthlyFees) }}</span>
            <span class="r"><strong>{{ show(m.income) }}</strong></span>
            <span class="r">{{ show(m.salaries) }}</span>
            <span class="r">{{ show(m.expenses) }}</span>
            <span class="r"><strong [class.pin-red]="m.net < 0">{{ m.income || m.salaries || m.expenses ? money(m.net) : '—' }}</strong></span>
          </div>
        }
        <div class="pin-row pin-row--total">
          <span>Total</span><span class="r">{{ money(sum('admissionFees')) }}</span><span class="r">{{ money(sum('monthlyFees')) }}</span>
          <span class="r">{{ money(r.income) }}</span><span class="r">{{ money(r.salaries) }}</span><span class="r">{{ money(r.expenses) }}</span>
          <span class="r" [class.pin-red]="r.net < 0">{{ money(r.net) }}</span>
        </div>
      </div>

      <div class="pin-split">
        <section class="app-card pin-card">
          <h2>Fees received by mode</h2>
          @for (x of modes(); track x.name) { <p><span>{{ x.name }}</span><strong>{{ money(x.amount) }}</strong></p> }
          @empty { <p class="app-muted">No fees received in {{ r.year }}.</p> }
        </section>
        <section class="app-card pin-card">
          <h2>Expenses by head</h2>
          @for (x of heads(); track x.name) { <p><span>{{ x.name }}</span><strong>{{ money(x.amount) }}</strong></p> }
          @empty { <p class="app-muted">No expenses in {{ r.year }}.</p> }
        </section>
      </div>
    }
  `,
  styles: [`
    .pin-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .pin-year { display: flex; align-items: center; gap: 0.4rem; margin: 0.4rem 0 1rem; }
    .pin-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .pin-kpis div { padding: 0.8rem 1rem; border-radius: 12px; background: #fff; border: 1px solid var(--app-border); }
    .pin-kpis span { display: block; font-size: 0.8rem; color: var(--app-text-muted); }
    .pin-kpis strong { font-size: 1.35rem; }
    .pin-green { color: #2b7a2b; }
    .pin-red { color: #b42318; }
    .pin-chart { padding: 1rem 1.15rem; margin-bottom: 1rem; }
    .pin-chart h2 { margin: 0 0 0.5rem; font-size: 1rem; }
    .pin-table { padding: 0; overflow-x: auto; margin-bottom: 1rem; }
    .pin-row { display: grid; grid-template-columns: 1fr repeat(6, minmax(5.5rem, 1fr)); gap: 0.5rem; padding: 0.55rem 1rem;
      border-bottom: 1px solid var(--app-border); min-width: 44rem; }
    .pin-row--head span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--app-text-muted); }
    .pin-row--empty { color: var(--app-text-muted); }
    .pin-row--total { background: #faf9fc; font-weight: 700; border-bottom: 0; }
    .r { text-align: right; }
    .pin-split { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .pin-card { padding: 1rem 1.15rem; }
    .pin-card h2 { margin: 0 0 0.5rem; font-size: 1rem; }
    .pin-card p { display: flex; justify-content: space-between; margin: 0.35rem 0; }
    @media (max-width: 760px) { .pin-split { grid-template-columns: 1fr; } }
  `]
})
export class PreSchoolIncomeComponent implements OnInit {
  private readonly finance = inject(PreSchoolFinanceService);

  readonly year = signal(new Date().getFullYear());
  readonly report = signal<PreSchoolIncomeReport | null>(null);
  readonly money = formatMoney;
  readonly label = monthLabel;

  /** Fees received against salaries and expenses for each month, bars, with the net as a line. */
  readonly chart = computed(() => {
    const months = this.report()?.months ?? [];
    return {
      labels: months.map(m => monthLabel(m.month).split(' ')[0]),
      datasets: [
        { type: 'line', label: 'Net', data: months.map(m => m.net), borderColor: '#ff6b8b', backgroundColor: '#ff6b8b', tension: 0, pointRadius: 4, order: 0 },
        { type: 'bar', label: 'Admission fees', data: months.map(m => m.admissionFees), backgroundColor: '#7c3aed', stack: 'in', order: 1 },
        { type: 'bar', label: 'Monthly fees', data: months.map(m => m.monthlyFees), backgroundColor: '#2b9a4b', stack: 'in', order: 1 },
        { type: 'bar', label: 'Salaries', data: months.map(m => m.salaries), backgroundColor: '#f59e0b', stack: 'out', order: 1 },
        { type: 'bar', label: 'Other expenses', data: months.map(m => m.expenses), backgroundColor: '#94a3b8', stack: 'out', order: 1 }
      ]
    };
  });

  readonly chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { callbacks: { label: (c: { dataset: { label?: string }; parsed: { y: number } }) => `${c.dataset.label}: ${formatMoney(c.parsed.y)}` } }
    },
    scales: {
      x: { stacked: true, grid: { display: false } },
      y: { stacked: true, ticks: { callback: (v: number | string) => formatMoney(Number(v)) } }
    }
  };

  readonly modes = computed(() => Object.entries(this.report()?.incomeByMode ?? {}).map(([name, amount]) => ({ name, amount })));
  readonly heads = computed(() => Object.entries(this.report()?.expensesByHead ?? {}).map(([name, amount]) => ({ name, amount })));

  ngOnInit(): void { this.load(); }

  setYear(y: number): void { this.year.set(y); this.load(); }

  private load(): void { this.finance.income(this.year()).subscribe(r => this.report.set(r)); }

  show(n: number): string { return n ? this.money(n) : '—'; }

  sum(key: 'admissionFees' | 'monthlyFees'): number {
    return (this.report()?.months ?? []).reduce((n, m) => n + m[key], 0);
  }

  print(): void {
    const r = this.report();
    if (!r) return;
    const e = escapeHtml;
    const rows = r.months.map(m => `<tr><td>${e(monthLabel(m.month))}</td><td class="r">${e(this.show(m.admissionFees))}</td>
      <td class="r">${e(this.show(m.monthlyFees))}</td><td class="r">${e(this.show(m.income))}</td><td class="r">${e(this.show(m.salaries))}</td>
      <td class="r">${e(this.show(m.expenses))}</td><td class="r">${m.income || m.salaries || m.expenses ? e(this.money(m.net)) : '—'}</td></tr>`).join('');
    openDocumentWindow(`<!doctype html><html><head><meta charset="utf-8"><title>Avijan PreSchool — Income report ${r.year}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#1f2433}h1{margin:0}p{color:#5b6178}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}th,td{border-bottom:1px solid #e4e6ef;padding:7px 5px;text-align:left}
      th{font-size:11px;text-transform:uppercase;color:#6b7088}.r{text-align:right}tfoot td{font-weight:700}
      button{margin-top:16px;padding:8px 18px;border:0;border-radius:999px;background:#6d28d9;color:#fff;font-weight:600}@media print{button{display:none}}</style></head>
      <body><h1>Avijan PreSchool — Income report ${r.year}</h1><p>Fees received, salaries paid and expenses, month by month.</p>
      <table><thead><tr><th>Month</th><th class="r">Admission</th><th class="r">Monthly fees</th><th class="r">Income</th><th class="r">Salaries</th><th class="r">Expenses</th><th class="r">Net</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td>Total</td><td class="r">${e(this.money(this.sum('admissionFees')))}</td><td class="r">${e(this.money(this.sum('monthlyFees')))}</td>
      <td class="r">${e(this.money(r.income))}</td><td class="r">${e(this.money(r.salaries))}</td><td class="r">${e(this.money(r.expenses))}</td><td class="r">${e(this.money(r.net))}</td></tr></tfoot></table>
      <button onclick="window.print()">Print / Save as PDF</button></body></html>`);
  }
}
