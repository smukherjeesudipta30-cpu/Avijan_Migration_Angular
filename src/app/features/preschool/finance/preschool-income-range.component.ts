import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';

import { formatMoney } from '../../../core/format/money';
import { todayIso } from '../../../core/models/preschool.model';
import { PreSchoolIncomeRange } from '../../../core/models/preschool-finance.model';
import { downloadCsv } from '../../../core/printing/csv-download';
import { escapeHtml, openDocumentWindow } from '../../../core/printing/legacy-documents';
import { PreSchoolFinanceService } from '../../../core/services/preschool-finance.service';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const monthOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

/**
 * The income report for any two dates — not only a whole month or year —
 * with every receipt, salary and expense behind the totals, to download as a
 * PDF or an Excel file. Fees still run month by month (1st to the last day);
 * this only chooses which days' money is counted.
 */
@Component({
  selector: 'app-preschool-income-range',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule],
  template: `
    <section class="app-card pir">
      <h2>Any dates <small class="app-muted">— income, salaries and expenses between two days, to download</small></h2>
      <div class="pir__bar">
        <label>From <input type="date" [(ngModel)]="from" [max]="to" /></label>
        <label>To <input type="date" [(ngModel)]="to" [min]="from" /></label>
        <p-button label="Show" icon="pi pi-search" size="small" [loading]="loading()" (onClick)="load()" />
        <p-button label="PDF" icon="pi pi-print" size="small" [outlined]="true" [disabled]="!data()" (onClick)="print()" />
        <p-button label="Excel" icon="pi pi-file-excel" size="small" severity="success" [outlined]="true" [disabled]="!data()" (onClick)="excel()" />
      </div>
      @if (data(); as d) {
        <div class="pir__kpis">
          <div><span>Fees received</span><strong class="pir__green">{{ money(d.income) }}</strong><small>Admission {{ money(d.admissionFees) }} · Monthly {{ money(d.monthlyFees) }}</small></div>
          <div><span>Salaries paid</span><strong>{{ money(d.salaries) }}</strong><small>{{ d.salaryPayments.length }} payment(s)</small></div>
          <div><span>Other expenses</span><strong>{{ money(d.expenses) }}</strong><small>{{ d.expenseEntries.length }} entr{{ d.expenseEntries.length === 1 ? 'y' : 'ies' }}</small></div>
          <div><span>Net</span><strong [class.pir__red]="d.net < 0" [class.pir__green]="d.net >= 0">{{ money(d.net) }}</strong>
            <small>{{ d.from | date: 'd MMM y' }} – {{ d.to | date: 'd MMM y' }}</small></div>
        </div>
        <p class="app-muted pir__note">{{ d.receipts.length }} receipt(s) in these dates. Download the PDF or Excel file for every entry.</p>
      }
    </section>
  `,
  styles: [`
    .pir { padding: 1rem 1.15rem; margin-bottom: 1rem; }
    .pir h2 { margin: 0 0 0.6rem; font-size: 1rem; }
    .pir h2 small { font-weight: 400; font-size: 0.8rem; }
    .pir__bar { display: flex; gap: 0.6rem; align-items: flex-end; flex-wrap: wrap; }
    .pir__bar label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.78rem; font-weight: 600; }
    .pir__bar input { padding: 0.4rem 0.55rem; border: 1px solid var(--app-border); border-radius: 6px; font: inherit; }
    .pir__kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.75rem; margin-top: 0.9rem; }
    .pir__kpis div { padding: 0.7rem 0.9rem; border-radius: 12px; border: 1px solid var(--app-border); }
    .pir__kpis span, .pir__kpis small { display: block; font-size: 0.76rem; color: var(--app-text-muted); }
    .pir__kpis strong { font-size: 1.2rem; }
    .pir__green { color: #2b7a2b; }
    .pir__red { color: #b42318; }
    .pir__note { margin: 0.6rem 0 0; font-size: 0.82rem; }
  `]
})
export class PreSchoolIncomeRangeComponent {
  private readonly finance = inject(PreSchoolFinanceService);

  readonly money = formatMoney;
  readonly data = signal<PreSchoolIncomeRange | null>(null);
  readonly loading = signal(false);
  from = todayIso().slice(0, 8) + '01';
  to = todayIso();

  load(): void {
    if (!this.from || !this.to || this.to < this.from) return;
    this.loading.set(true);
    this.finance.incomeRange(this.from, this.to).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  private get title(): string {
    const d = this.data()!;
    return `${fmt(d.from)} to ${fmt(d.to)}`;
  }

  excel(): void {
    const d = this.data();
    if (!d) return;
    downloadCsv(`Avijan-PreSchool-income-${d.from}-to-${d.to}`, [
      { title: `Avijan PreSchool — Income report — ${this.title}`, header: ['', 'Amount'], rows: [
        ['Admission fees', d.admissionFees], ['Monthly fees', d.monthlyFees], ['Fees received', d.income],
        ['Salaries paid', d.salaries], ['Other expenses', d.expenses], ['Net', d.net]] },
      { title: 'Fees received', header: ['Date', 'Receipt', 'Child', 'Class', 'Mode', 'Admission', 'Monthly', 'Total'],
        rows: d.receipts.map(r => [r.receivedOn, r.receiptCode, r.childName, r.className, r.mode, r.admissionFee, r.monthlyFees, r.total]) },
      { title: 'Salaries paid', header: ['Date paid', 'Staff', 'Role', 'For month', 'Mode', 'Amount'],
        rows: d.salaryPayments.map(s => [s.paidOn, s.staffName, s.role, monthOf(s.forMonth), s.mode, s.amount]) },
      { title: 'Other expenses', header: ['Date', 'Head', 'Description', 'Mode', 'Amount'],
        rows: d.expenseEntries.map(x => [x.spentOn, x.head, x.description, x.mode, x.amount]) }
    ]);
  }

  print(): void {
    const d = this.data();
    if (!d) return;
    const e = escapeHtml, m = this.money;
    const table = (head: string[], rows: string[][], right: number[]) =>
      `<table><thead><tr>${head.map((h, i) => `<th${right.includes(i) ? ' class="r"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>` +
      (rows.length ? rows.map(r => `<tr>${r.map((c, i) => `<td${right.includes(i) ? ' class="r"' : ''}>${c}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${head.length}">None.</td></tr>`) + '</tbody></table>';
    openDocumentWindow(`<!doctype html><html><head><meta charset="utf-8"><title>Avijan PreSchool — Income ${e(this.title)}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#1f2433}h1{margin:0}h2{font-size:15px;margin:20px 0 6px}p{color:#5b6178}
      table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border-bottom:1px solid #e4e6ef;padding:6px 5px;text-align:left}
      th{font-size:11px;text-transform:uppercase;color:#6b7088}.r{text-align:right}.sum td{font-weight:700}
      button{margin-top:16px;padding:8px 18px;border:0;border-radius:999px;background:#6d28d9;color:#fff;font-weight:600}@media print{button{display:none}}</style></head>
      <body><h1>Avijan PreSchool — Income report</h1><p>${e(this.title)} · cancelled receipts are left out.</p>
      <table class="sum"><tbody>
        <tr><td>Fees received (admission ${e(m(d.admissionFees))}, monthly ${e(m(d.monthlyFees))})</td><td class="r">${e(m(d.income))}</td></tr>
        <tr><td>Salaries paid</td><td class="r">${e(m(d.salaries))}</td></tr><tr><td>Other expenses</td><td class="r">${e(m(d.expenses))}</td></tr>
        <tr><td>Net</td><td class="r">${e(m(d.net))}</td></tr></tbody></table>
      <h2>Fees received</h2>${table(['Date', 'Receipt', 'Child', 'Class', 'Mode', 'Amount'],
        d.receipts.map(r => [e(fmt(r.receivedOn)), e(r.receiptCode), e(r.childName), e(r.className), e(r.mode), e(m(r.total))]), [5])}
      <h2>Salaries paid</h2>${table(['Date', 'Staff', 'For month', 'Mode', 'Amount'],
        d.salaryPayments.map(s => [e(fmt(s.paidOn)), `${e(s.staffName)} <small>(${e(s.role)})</small>`, e(monthOf(s.forMonth)), e(s.mode), e(m(s.amount))]), [4])}
      <h2>Other expenses</h2>${table(['Date', 'Head', 'Mode', 'Amount'],
        d.expenseEntries.map(x => [e(fmt(x.spentOn)), `${e(x.head)}${x.description ? ` <small>— ${e(x.description)}</small>` : ''}`, e(x.mode), e(m(x.amount))]), [3])}
      <button onclick="window.print()">Print / Save as PDF</button></body></html>`);
  }
}
