import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolHonorariumReport, PreSchoolSalaryPayment } from '../../../core/models/preschool-finance.model';
import { monthLabel } from '../../../core/models/preschool-student.model';
import { downloadCsv } from '../../../core/printing/csv-download';
import { escapeHtml, openDocumentWindow, openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { preSchoolPayslipHtml } from '../../../core/printing/preschool-payslip';
import { PreSchoolFinanceService } from '../../../core/services/preschool-finance.service';

const iso = (d: Date) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
const fmt = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Honorarium report for the PreSchool admin: what each teacher, receptionist
 * and housekeeper was paid. Month-wise, a month runs from its 1st to its last
 * day; or any two dates, by the day each payment was made. With reference
 * fees earned and paid, and every slip.
 */
@Component({
  selector: 'app-preschool-honorarium-report',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool · Accounts</span>
      <h1>Honorarium report</h1>
      <p class="app-muted">What each teacher, receptionist and housekeeper was paid — month by month (1st to last day), or between any two dates.</p>
    </div>

    <div class="app-card phr-filters">
      <div class="phr-tabs" role="tablist">
        <button type="button" role="tab" [class.on]="basis() === 'month'" (click)="setBasis('month')">Month-wise</button>
        <button type="button" role="tab" [class.on]="basis() === 'paid'" (click)="setBasis('paid')">Custom dates</button>
      </div>
      @if (basis() === 'month') {
        <div class="phr-range">
          <p-button icon="pi pi-chevron-left" [text]="true" [rounded]="true" ariaLabel="Previous month" (onClick)="shiftMonth(-1)" />
          <label>From month <input type="month" [(ngModel)]="fromMonth" [max]="toMonth" /></label>
          <label>To month <input type="month" [(ngModel)]="toMonth" [min]="fromMonth" /></label>
          <p-button icon="pi pi-chevron-right" [text]="true" [rounded]="true" ariaLabel="Next month" (onClick)="shiftMonth(1)" />
          <p-button label="Show" icon="pi pi-search" [loading]="loading()" (onClick)="load()" />
        </div>
        <small class="app-muted">Each month runs from its 1st to its last day; a slip counts in the month it is for.</small>
      } @else {
        <div class="phr-range">
          <label>From <input type="date" [(ngModel)]="from" [max]="to" /></label>
          <label>To <input type="date" [(ngModel)]="to" [min]="from" /></label>
          <p-button label="Show" icon="pi pi-search" [loading]="loading()" [disabled]="!from || !to || to < from" (onClick)="load()" />
        </div>
        <small class="app-muted">Every payment made between these two days, whichever month it was for.</small>
      }
    </div>

    @if (report(); as r) {
      <div class="phr-kpis">
        <div><span>Honorarium</span><strong>{{ money(r.honorarium) }}</strong></div>
        <div><span>Less absence</span><strong class="phr-red">− {{ money(r.deduction) }}</strong></div>
        <div><span>Reference fees paid</span><strong class="phr-green">+ {{ money(r.referenceFees) }}</strong></div>
        <div class="phr-main"><span>Total paid</span><strong>{{ money(r.netPaid) }}</strong><small>{{ r.payments.length }} slip{{ r.payments.length === 1 ? '' : 's' }}</small></div>
      </div>

      <div class="phr-actions">
        <span class="app-muted">{{ title() }}</span>
        <span>
          <p-button label="Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" [disabled]="!r.byStaff.length" (onClick)="excel()" />
          <p-button label="PDF / Print" icon="pi pi-print" severity="secondary" [outlined]="true" size="small" [disabled]="!r.byStaff.length" (onClick)="print()" />
        </span>
      </div>

      <section class="app-card phr-wrap">
        <h2>By person</h2>
        <table class="phr-table">
          <thead><tr><th>Name</th><th>Role</th><th class="r">Slips</th><th class="r">Honorarium</th><th class="r">Absence</th>
            <th class="r">Reference fees paid</th><th class="r">Total paid</th><th class="r">Reference earned</th></tr></thead>
          <tbody>
            @for (s of r.byStaff; track s.staffId) {
              <tr><td><strong>{{ s.name }}</strong></td><td>{{ s.role }}</td><td class="r">{{ s.payments }}</td>
                <td class="r">{{ money(s.honorarium) }}</td><td class="r">{{ s.deduction ? '− ' + money(s.deduction) : '—' }}</td>
                <td class="r">{{ s.referenceFees ? money(s.referenceFees) : '—' }}</td><td class="r"><strong>{{ money(s.netPaid) }}</strong></td>
                <td class="r">{{ s.referenceEarned ? money(s.referenceEarned) : '—' }}</td></tr>
            }
          </tbody>
          @if (r.byStaff.length) {
            <tfoot><tr><td colspan="3">Total</td><td class="r">{{ money(r.honorarium) }}</td><td class="r">− {{ money(r.deduction) }}</td>
              <td class="r">{{ money(r.referenceFees) }}</td><td class="r">{{ money(r.netPaid) }}</td><td class="r">{{ money(earned()) }}</td></tr></tfoot>
          }
        </table>
        @if (!r.byStaff.length) { <p class="app-muted phr-empty">No honorarium paid in these dates.</p> }
      </section>

      @for (g of months(); track g.month) {
        <section class="app-card phr-wrap">
          <h2>{{ basis() === 'month' ? label(g.month) : 'Paid in these dates' }} <small>{{ money(g.total) }}</small></h2>
          <table class="phr-table">
            <thead><tr><th>Name</th><th>For month</th><th>Paid on</th><th>Mode</th><th class="r">Honorarium</th><th class="r">Absence</th>
              <th class="r">Reference</th><th class="r">Paid</th><th></th></tr></thead>
            <tbody>
              @for (p of g.slips; track p.id) {
                <tr><td>{{ p.staffName }} <small>{{ p.role }}</small></td><td>{{ label(p.forMonth) }}</td><td class="nw">{{ p.paidOn | date: 'd MMM y' }}</td>
                  <td>{{ p.mode }}</td><td class="r">{{ money(p.salary) }}</td>
                  <td class="r">{{ p.deduction ? '− ' + money(p.deduction) + ' (' + p.daysAbsent + 'd)' : '—' }}</td>
                  <td class="r">{{ p.referralBonus ? '+ ' + money(p.referralBonus) : '—' }}</td><td class="r"><strong>{{ money(p.netPaid) }}</strong></td>
                  <td><p-button icon="pi pi-print" [text]="true" [rounded]="true" size="small" ariaLabel="Open the honorarium slip" (onClick)="slip(p)" /></td></tr>
              }
            </tbody>
          </table>
        </section>
      }

      @if (r.referenceCredits.length) {
        <section class="app-card phr-wrap">
          <h2>Reference fees earned in these dates</h2>
          <table class="phr-table">
            <thead><tr><th>Date</th><th>Earned by</th><th>Child</th><th>Receipt</th><th class="r">Parent paid</th><th class="r">Fee</th><th>Paid with</th></tr></thead>
            <tbody>
              @for (c of r.referenceCredits; track c.id) {
                <tr><td class="nw">{{ c.creditedOn | date: 'd MMM y' }}</td><td>{{ c.staffName }}</td><td>{{ c.childName }} <small>{{ c.admissionCode }}</small></td>
                  <td>{{ c.receiptCode }}</td><td class="r">{{ money(c.paymentAmount) }}</td><td class="r">{{ money(c.amount) }} <small>{{ c.percent }}%</small></td>
                  <td>{{ c.paidWithSalaryFor ? label(c.paidWithSalaryFor) : 'Not yet paid' }}</td></tr>
              }
            </tbody>
          </table>
        </section>
      }
    }
  `,
  styles: [`
    .phr-filters { display: flex; flex-direction: column; gap: 0.6rem; padding: 0.9rem 1rem; margin: 0.5rem 0 1rem; }
    .phr-tabs { display: flex; gap: 0.4rem; }
    .phr-tabs button { padding: 0.45rem 1rem; border-radius: 999px; border: 1px solid var(--app-border); background: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .phr-tabs button.on { border-color: #ff6b8b; background: #fff0f4; color: #b3264f; }
    .phr-range { display: flex; gap: 0.6rem; align-items: flex-end; flex-wrap: wrap; }
    .phr-range label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; font-weight: 600; }
    .phr-range input { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .phr-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.6rem; margin-bottom: 0.75rem; }
    .phr-kpis div { padding: 0.75rem 1rem; border-radius: 12px; background: #fff; border: 1px solid var(--app-border); }
    .phr-kpis span, .phr-kpis small { display: block; font-size: 0.78rem; color: var(--app-text-muted); }
    .phr-kpis strong { font-size: 1.25rem; }
    .phr-main strong { color: #b3264f; font-size: 1.45rem; }
    .phr-red { color: #b42318; } .phr-green { color: #2b7a2b; }
    .phr-actions { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
    .phr-actions > span:last-child { display: flex; gap: 0.4rem; }
    .phr-wrap { padding: 0.8rem 0 0; overflow-x: auto; margin-bottom: 0.75rem; }
    .phr-wrap h2 { margin: 0 1rem 0.5rem; font-size: 1rem; }
    .phr-wrap h2 small { color: var(--app-text-muted); font-weight: 600; margin-left: 0.4rem; }
    .phr-table { width: 100%; min-width: 820px; border-collapse: collapse; font-size: 0.86rem; }
    .phr-table th { text-align: left; padding: 0.5rem 0.7rem; background: #f8f7fc; font-size: 0.7rem; text-transform: uppercase;
      letter-spacing: 0.03em; color: var(--app-text-muted); border-bottom: 1px solid var(--app-border); white-space: nowrap; }
    .phr-table td { padding: 0.45rem 0.7rem; border-bottom: 1px solid var(--app-border); }
    .phr-table small { color: var(--app-text-muted); }
    .phr-table tfoot td { font-weight: 700; background: #faf9fc; }
    .nw { white-space: nowrap; }
    .r { text-align: right; white-space: nowrap; }
    .phr-empty { padding: 0 1rem 1rem; }
  `]
})
export class PreSchoolHonorariumReportComponent implements OnInit {
  private readonly finance = inject(PreSchoolFinanceService);
  private readonly messages = inject(MessageService);

  readonly report = signal<PreSchoolHonorariumReport | null>(null);
  readonly loading = signal(false);
  readonly basis = signal<'month' | 'paid'>('month');
  readonly money = formatMoney;
  readonly label = monthLabel;

  fromMonth = iso(new Date()).slice(0, 7);
  toMonth = iso(new Date()).slice(0, 7);
  from = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  to = iso(new Date());

  readonly earned = computed(() => (this.report()?.byStaff ?? []).reduce((t, s) => t + s.referenceEarned, 0));

  /** Slips grouped by the month they are for (month-wise), or all together (custom dates). */
  readonly months = computed(() => {
    const r = this.report();
    if (!r || !r.payments.length) return [];
    const groups = new Map<string, PreSchoolSalaryPayment[]>();
    for (const p of r.payments) {
      const key = r.basis === 'month' ? p.forMonth : 'all';
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    return [...groups].map(([month, slips]) => ({ month, slips, total: slips.reduce((t, p) => t + p.netPaid, 0) }));
  });

  readonly title = computed(() => {
    const r = this.report();
    if (!r) return '';
    if (r.basis === 'month') {
      const a = monthLabel(r.from.slice(0, 8) + '01'), b = monthLabel(r.to.slice(0, 8) + '01');
      return a === b ? `${a} (1st to last day)` : `${a} to ${b}, month-wise`;
    }
    return `Paid ${fmt(r.from)} to ${fmt(r.to)}`;
  });

  ngOnInit(): void { this.load(); }

  setBasis(b: 'month' | 'paid'): void { this.basis.set(b); this.load(); }

  shiftMonth(by: number): void {
    const [y, m] = this.fromMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + by, 1);
    this.fromMonth = this.toMonth = iso(d).slice(0, 7);
    this.load();
  }

  load(): void {
    const [from, to] = this.basis() === 'month'
      ? [`${this.fromMonth}-01`, `${this.toMonth}-01`]
      : [this.from, this.to];
    if (!from || !to || to < from) return;
    this.loading.set(true);
    this.finance.honorarium(from, to, this.basis()).subscribe({
      next: r => { this.report.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  slip(p: PreSchoolSalaryPayment): void {
    const win = openPendingDocumentWindow(780, 960);
    if (!writeDocumentWindow(win, preSchoolPayslipHtml(p))) {
      this.messages.add({ severity: 'warn', summary: 'Pop-up blocked', detail: 'Allow pop-ups for this site to open the slip.', life: 4500 });
    }
  }

  excel(): void {
    const r = this.report();
    if (!r) return;
    downloadCsv(`Avijan-PreSchool-honorarium-${r.from}-to-${r.to}`, [
      { title: `Avijan PreSchool — Honorarium report — ${this.title()}`, header: ['Name', 'Role', 'Slips', 'Honorarium', 'Absence', 'Reference fees paid', 'Total paid', 'Reference earned'],
        rows: r.byStaff.map(s => [s.name, s.role, s.payments, s.honorarium, -s.deduction, s.referenceFees, s.netPaid, s.referenceEarned]) },
      { title: 'Slips', header: ['Name', 'Role', 'For month', 'Paid on', 'Mode', 'Honorarium', 'Days absent', 'Absence', 'Reference fees', 'Paid'],
        rows: r.payments.map(p => [p.staffName, p.role, p.forMonth.slice(0, 7), p.paidOn, p.mode, p.salary, p.daysAbsent, -p.deduction, p.referralBonus ?? 0, p.netPaid]) },
      { title: 'Reference fees earned', header: ['Date', 'Earned by', 'Child', 'Receipt', 'Parent paid', 'Percent', 'Fee', 'Paid with salary for'],
        rows: r.referenceCredits.map(c => [c.creditedOn, c.staffName, c.childName, c.receiptCode, c.paymentAmount, c.percent, c.amount, c.paidWithSalaryFor?.slice(0, 7) ?? 'not yet']) }
    ]);
  }

  print(): void {
    const r = this.report();
    if (!r) return;
    const e = escapeHtml, m = this.money;
    const staff = r.byStaff.map(s => `<tr><td>${e(s.name)}</td><td>${e(s.role)}</td><td class="r">${e(m(s.honorarium))}</td>
      <td class="r">${s.deduction ? '− ' + e(m(s.deduction)) : '—'}</td><td class="r">${s.referenceFees ? e(m(s.referenceFees)) : '—'}</td>
      <td class="r"><b>${e(m(s.netPaid))}</b></td></tr>`).join('');
    const slips = r.payments.map(p => `<tr><td>${e(p.staffName)}</td><td>${e(monthLabel(p.forMonth))}</td><td>${e(fmt(p.paidOn))}</td><td>${e(p.mode)}</td>
      <td class="r">${e(m(p.salary))}</td><td class="r">${p.deduction ? '− ' + e(m(p.deduction)) : '—'}</td>
      <td class="r">${p.referralBonus ? e(m(p.referralBonus)) : '—'}</td><td class="r">${e(m(p.netPaid))}</td></tr>`).join('');
    openDocumentWindow(`<!doctype html><html><head><meta charset="utf-8"><title>Avijan PreSchool — Honorarium ${e(this.title())}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#1f2433}h1{margin:0}h2{font-size:14px;margin:18px 0 6px}p{color:#5b6178}
      table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border-bottom:1px solid #e4e6ef;padding:6px 5px;text-align:left}
      th{font-size:11px;text-transform:uppercase;color:#6b7088}.r{text-align:right}tfoot td{font-weight:700}
      button{margin-top:16px;padding:8px 18px;border:0;border-radius:999px;background:#ff6b8b;color:#fff;font-weight:600}@media print{button{display:none}}</style></head>
      <body><h1>Avijan PreSchool — Honorarium report</h1><p>${e(this.title())} · total paid ${e(m(r.netPaid))}</p>
      <h2>By person</h2><table><thead><tr><th>Name</th><th>Role</th><th class="r">Honorarium</th><th class="r">Absence</th><th class="r">Reference fees</th><th class="r">Total paid</th></tr></thead>
      <tbody>${staff}</tbody><tfoot><tr><td colspan="2">Total</td><td class="r">${e(m(r.honorarium))}</td><td class="r">− ${e(m(r.deduction))}</td>
      <td class="r">${e(m(r.referenceFees))}</td><td class="r">${e(m(r.netPaid))}</td></tr></tfoot></table>
      <h2>Slips</h2><table><thead><tr><th>Name</th><th>For month</th><th>Paid on</th><th>Mode</th><th class="r">Honorarium</th><th class="r">Absence</th><th class="r">Reference</th><th class="r">Paid</th></tr></thead>
      <tbody>${slips}</tbody></table>
      <button onclick="window.print()">Print / Save as PDF</button></body></html>`);
  }
}
