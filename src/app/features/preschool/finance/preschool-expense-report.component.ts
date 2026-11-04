import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';

import { formatMoney } from '../../../core/format/money';
import { todayIso } from '../../../core/models/preschool.model';
import { PreSchoolExpense } from '../../../core/models/preschool-finance.model';
import { monthLabel } from '../../../core/models/preschool-student.model';
import { escapeHtml, openDocumentWindow } from '../../../core/printing/legacy-documents';
import { PreSchoolFinanceService } from '../../../core/services/preschool-finance.service';

type Period = 'month' | 'year' | 'all';

/** The earliest day "All time" reaches back to; the PreSchool did not exist before it. */
const ALL_FROM = '2026-01-01';

const pad = (n: number) => `${n}`.padStart(2, '0');

/**
 * The PreSchool's expenses for a month, a year or all time: totals by head
 * (with a chart), by payment mode, and every entry, printable. Salaries are
 * not here — they are in the income report. PreSchool admin only.
 */
@Component({
  selector: 'app-preschool-expense-report',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, ChartModule],
  template: `
    <div class="per-head">
      <div class="app-page-head">
        <span class="app-eyebrow">Avijan PreSchool · Accounts</span>
        <h1>Expense report</h1>
        <p class="app-muted">What the PreSchool spent, by head. Salaries are in the income report.</p>
      </div>
      <p-button label="Print / PDF" icon="pi pi-print" [outlined]="true" [disabled]="!list().length" (onClick)="print()" />
    </div>

    <div class="per-bar">
      <div class="per-tabs" role="tablist" aria-label="Period">
        <button type="button" role="tab" [class.on]="period() === 'month'" [attr.aria-selected]="period() === 'month'" (click)="setPeriod('month')">Monthly</button>
        <button type="button" role="tab" [class.on]="period() === 'year'" [attr.aria-selected]="period() === 'year'" (click)="setPeriod('year')">Yearly</button>
        <button type="button" role="tab" [class.on]="period() === 'all'" [attr.aria-selected]="period() === 'all'" (click)="setPeriod('all')">All time</button>
      </div>
      @if (period() !== 'all') {
        <div class="per-step">
          <p-button icon="pi pi-chevron-left" [text]="true" [rounded]="true" ariaLabel="Earlier" (onClick)="step(-1)" />
          <strong>{{ title() }}</strong>
          <p-button icon="pi pi-chevron-right" [text]="true" [rounded]="true" ariaLabel="Later" (onClick)="step(1)" />
        </div>
      } @else {
        <strong class="per-step">{{ title() }}</strong>
      }
    </div>

    <div class="per-kpis">
      <div><span>Total spent</span><strong>{{ money(total()) }}</strong></div>
      <div><span>Entries</span><strong>{{ list().length }}</strong></div>
      <div><span>Biggest head</span><strong>{{ heads().length ? heads()[0].name : '—' }}</strong></div>
    </div>

    @if (list().length) {
      <div class="per-split">
        <section class="app-card per-card">
          <h2>By head</h2>
          <p-chart type="bar" [data]="chart()" [options]="chartOptions" [height]="chartHeight()" />
        </section>
        <section class="app-card per-card">
          <h2>Totals</h2>
          @for (h of heads(); track h.name) {
            <p class="per-line"><span>{{ h.name }} <small>{{ h.count }} {{ h.count === 1 ? 'entry' : 'entries' }}</small></span>
              <strong>{{ money(h.amount) }}</strong><em>{{ share(h.amount) }}%</em></p>
          }
          <h2 class="per-sub">By payment mode</h2>
          @for (m of modes(); track m.name) { <p class="per-line"><span>{{ m.name }}</span><strong>{{ money(m.amount) }}</strong><em></em></p> }
        </section>
      </div>
    }

    <section class="app-card per-card">
      <h2>All entries</h2>
      @for (e of list(); track e.id) {
        <div class="per-row">
          <span class="per-date">{{ e.spentOn | date: 'd MMM y' }}</span>
          <span><strong>{{ e.head }}</strong>@if (e.description) { <small>{{ e.description }}</small> }</span>
          <span class="per-mode">{{ e.mode }}@if (e.reference) { · {{ e.reference }} }</span>
          <strong>{{ money(e.amount) }}</strong>
        </div>
      } @empty {
        <p class="app-muted">No expenses in {{ title() }}.</p>
      }
    </section>
  `,
  styles: [`
    .per-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .per-bar { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin: 0.4rem 0 1rem; }
    .per-tabs { display: inline-flex; padding: 4px; gap: 4px; border-radius: 999px; background: #efeaf8; }
    .per-tabs button { border: 0; background: none; padding: 0.45rem 1rem; border-radius: 999px; font: inherit; font-weight: 700; color: #5b21b6; cursor: pointer; }
    .per-tabs button.on { background: #6d28d9; color: #fff; }
    .per-step { display: flex; align-items: center; gap: 0.3rem; }
    .per-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .per-kpis div { padding: 0.8rem 1rem; border-radius: 12px; background: #fff; border: 1px solid var(--app-border); }
    .per-kpis span { display: block; font-size: 0.8rem; color: var(--app-text-muted); }
    .per-kpis strong { font-size: 1.3rem; }
    .per-split { display: grid; grid-template-columns: 1.2fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .per-card { padding: 1rem 1.15rem; }
    .per-card h2 { margin: 0 0 0.6rem; font-size: 1rem; }
    .per-sub { margin-top: 1rem !important; }
    .per-line { display: grid; grid-template-columns: 1fr auto 3.2rem; gap: 0.6rem; margin: 0.35rem 0; align-items: baseline; }
    .per-line small { color: var(--app-text-muted); font-size: 0.76rem; margin-left: 0.25rem; }
    .per-line em { font-style: normal; color: var(--app-text-muted); font-size: 0.82rem; text-align: right; }
    .per-row { display: grid; grid-template-columns: 7rem 1fr auto auto; gap: 0.75rem; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--app-border); }
    .per-row small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .per-date { color: #b3264f; font-weight: 700; }
    .per-mode { font-size: 0.8rem; color: var(--app-text-muted); }
    @media (max-width: 860px) { .per-split { grid-template-columns: 1fr; } .per-row { grid-template-columns: 1fr auto; } .per-row .per-mode, .per-row .per-date { display: none; } }
  `]
})
export class PreSchoolExpenseReportComponent implements OnInit {
  private readonly finance = inject(PreSchoolFinanceService);

  readonly money = formatMoney;
  readonly period = signal<Period>('month');
  /** The first of the month being looked at; its year for the yearly view. */
  readonly anchor = signal(todayIso().slice(0, 8) + '01');
  readonly list = signal<PreSchoolExpense[]>([]);

  readonly title = computed(() => {
    const a = this.anchor();
    if (this.period() === 'month') return monthLabel(a);
    if (this.period() === 'year') return a.slice(0, 4);
    return `All time (from ${monthLabel(ALL_FROM)})`;
  });

  readonly total = computed(() => this.list().reduce((n, e) => n + e.amount, 0));

  readonly heads = computed(() => {
    const by = new Map<string, { amount: number; count: number }>();
    for (const e of this.list()) {
      const h = by.get(e.head) ?? { amount: 0, count: 0 };
      h.amount += e.amount; h.count++;
      by.set(e.head, h);
    }
    return [...by.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount);
  });

  readonly modes = computed(() => {
    const by = new Map<string, number>();
    for (const e of this.list()) by.set(e.mode, (by.get(e.mode) ?? 0) + e.amount);
    return [...by.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  });

  readonly chart = computed(() => ({
    labels: this.heads().map(h => h.name),
    datasets: [{ label: 'Spent', data: this.heads().map(h => h.amount), backgroundColor: '#7c3aed', borderRadius: 6 }]
  }));

  /** Tall enough for one bar per head. */
  readonly chartHeight = computed(() => `${Math.max(160, this.heads().length * 38)}px`);

  readonly chartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c: { parsed: { x: number } }) => formatMoney(c.parsed.x) } }
    },
    scales: { x: { ticks: { callback: (v: number | string) => formatMoney(Number(v)) } }, y: { grid: { display: false } } }
  };

  ngOnInit(): void { this.load(); }

  setPeriod(p: Period): void { this.period.set(p); this.load(); }

  step(n: number): void {
    const [y, m] = this.anchor().split('-').map(Number);
    const d = this.period() === 'year' ? new Date(y + n, m - 1, 1) : new Date(y, m - 1 + n, 1);
    this.anchor.set(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`);
    this.load();
  }

  share(amount: number): string {
    return this.total() ? (Math.round((amount / this.total()) * 1000) / 10).toString() : '0';
  }

  private load(): void {
    const [y, m] = this.anchor().split('-').map(Number);
    let from: string, to: string;
    if (this.period() === 'month') {
      from = this.anchor();
      to = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
    } else if (this.period() === 'year') {
      from = `${y}-01-01`;
      to = `${y}-12-31`;
    } else {
      from = ALL_FROM;
      to = todayIso();
    }
    this.finance.expenses(from, to).subscribe(l => this.list.set(l));
  }

  print(): void {
    const e = escapeHtml;
    const heads = this.heads().map(h => `<tr><td>${e(h.name)}</td><td class="r">${h.count}</td><td class="r">${e(this.money(h.amount))}</td><td class="r">${this.share(h.amount)}%</td></tr>`).join('');
    const rows = this.list().map(x => `<tr><td>${new Date(x.spentOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
      <td>${e(x.head)}${x.description ? `<br><small>${e(x.description)}</small>` : ''}</td><td>${e(x.mode)}</td><td class="r">${e(this.money(x.amount))}</td></tr>`).join('');
    openDocumentWindow(`<!doctype html><html><head><meta charset="utf-8"><title>Avijan PreSchool — Expenses ${e(this.title())}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#1f2433}h1{margin:0}h2{font-size:15px;margin:20px 0 6px}p{color:#5b6178}
      table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e4e6ef;padding:7px 5px;text-align:left;vertical-align:top}
      th{font-size:11px;text-transform:uppercase;color:#6b7088}.r{text-align:right}small{color:#6b7088}tfoot td{font-weight:700}
      button{margin-top:16px;padding:8px 18px;border:0;border-radius:999px;background:#6d28d9;color:#fff;font-weight:600}@media print{button{display:none}}</style></head>
      <body><h1>Avijan PreSchool — Expense report</h1><p>${e(this.title())} · total ${e(this.money(this.total()))}</p>
      <h2>By head</h2><table><thead><tr><th>Head</th><th class="r">Entries</th><th class="r">Amount</th><th class="r">Share</th></tr></thead><tbody>${heads}</tbody>
      <tfoot><tr><td>Total</td><td class="r">${this.list().length}</td><td class="r">${e(this.money(this.total()))}</td><td></td></tr></tfoot></table>
      <h2>All entries</h2><table><thead><tr><th>Date</th><th>Head</th><th>Mode</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
      <button onclick="window.print()">Print / Save as PDF</button></body></html>`);
  }
}
