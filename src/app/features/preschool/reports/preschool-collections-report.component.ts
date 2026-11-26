import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolCollectionReport, PreSchoolIncomeReceiptLine } from '../../../core/models/preschool-finance.model';
import { downloadCsv } from '../../../core/printing/csv-download';
import { escapeHtml, openDocumentWindow } from '../../../core/printing/legacy-documents';
import { PreSchoolStudentService } from '../../../core/services/preschool-student.service';

const iso = (d: Date) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
const fmt = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

type Preset = 'today' | 'yesterday' | 'month' | 'lastMonth';

/**
 * Fee collection report: every payment received between two dates (a whole
 * receipt or one instalment), with the mode and the login that collected it,
 * and the totals by mode, by collector, by class and by day. Cancelled
 * receipts are left out. Downloads as Excel or PDF.
 */
@Component({
  selector: 'app-preschool-collections-report',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool · Reports</span>
      <h1>Fee collection report</h1>
      <p class="app-muted">Every payment received between two dates — cash, bank, UPI and the rest — with the child's admission details and who collected it.</p>
    </div>

    <div class="app-card pcr-filters">
      <div class="pcr-presets" role="group" aria-label="Quick dates">
        <button type="button" [class.on]="preset() === 'today'" (click)="usePreset('today')">Today</button>
        <button type="button" [class.on]="preset() === 'yesterday'" (click)="usePreset('yesterday')">Yesterday</button>
        <button type="button" [class.on]="preset() === 'month'" (click)="usePreset('month')">This month</button>
        <button type="button" [class.on]="preset() === 'lastMonth'" (click)="usePreset('lastMonth')">Last month</button>
      </div>
      <div class="pcr-range">
        <label>From <input type="date" [(ngModel)]="from" [max]="to" (ngModelChange)="preset.set(null)" /></label>
        <label>To <input type="date" [(ngModel)]="to" [min]="from" (ngModelChange)="preset.set(null)" /></label>
        <p-button label="Show" icon="pi pi-search" [loading]="loading()" [disabled]="!from || !to || to < from" (onClick)="load()" />
      </div>
      @if (report()) {
        <div class="pcr-range">
          <label>Mode
            <select [ngModel]="mode()" (ngModelChange)="mode.set($event)">
              <option value="">All modes</option>
              @for (m of modeNames(); track m) { <option [value]="m">{{ m }}</option> }
            </select></label>
          <label>Collected by
            <select [ngModel]="collector()" (ngModelChange)="collector.set($event)">
              <option value="">Everyone</option>
              @for (c of collectorNames(); track c) { <option [value]="c">{{ c }}</option> }
            </select></label>
          <label>Class
            <select [ngModel]="className()" (ngModelChange)="className.set($event)">
              <option value="">All classes</option>
              @for (c of classNames(); track c) { <option [value]="c">{{ c }}</option> }
            </select></label>
          <label class="pcr-check"><input type="checkbox" [ngModel]="admissionOnly()" (ngModelChange)="admissionOnly.set($event)" />
            Admission payments only</label>
        </div>
      }
    </div>

    @if (report(); as r) {
      <div class="pcr-kpis">
        <div class="pcr-kpi-main"><span>Collected</span><strong>{{ money(total()) }}</strong><small>{{ rows().length }} payment{{ rows().length === 1 ? '' : 's' }}</small></div>
        @for (m of byMode(); track m.name) { <div><span>{{ m.name }}</span><strong>{{ money(m.amount) }}</strong></div> }
      </div>

      <div class="pcr-split">
        <section class="app-card pcr-card">
          <h2>By who collected</h2>
          @for (c of byCollector(); track c.name) { <p><span>{{ c.name }}</span><strong>{{ money(c.amount) }}</strong></p> }
          @empty { <p class="app-muted">Nothing collected.</p> }
        </section>
        <section class="app-card pcr-card">
          <h2>By class</h2>
          @for (c of byClass(); track c.name) { <p><span>{{ c.name }}</span><strong>{{ money(c.amount) }}</strong></p> }
          @empty { <p class="app-muted">Nothing collected.</p> }
        </section>
        <section class="app-card pcr-card">
          <h2>What it was for</h2>
          <p><span>Admission fees</span><strong>{{ money(part('admissionFee')) }}</strong></p>
          <p><span>Monthly fees</span><strong>{{ money(part('monthlyFees')) }}</strong></p>
          <p><span>Other charges</span><strong>{{ money(part('otherFees')) }}</strong></p>
          @if (part('discount')) { <p><span>Less discounts</span><strong>− {{ money(part('discount')) }}</strong></p> }
        </section>
      </div>

      <div class="pcr-actions">
        <span class="app-muted">{{ title() }}</span>
        <span>
          <p-button label="Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" [disabled]="!rows().length" (onClick)="excel()" />
          <p-button label="PDF / Print" icon="pi pi-print" severity="secondary" [outlined]="true" size="small" [disabled]="!rows().length" (onClick)="print()" />
        </span>
      </div>

      <div class="app-card pcr-wrap">
        <table class="pcr-table">
          <thead><tr><th>Date</th><th>Receipt</th><th>Adm. No.</th><th>Child</th><th>Class</th><th>Parent · phone</th>
            <th class="r">Admission</th><th class="r">Monthly</th><th class="r">Other</th><th>Mode</th><th>Collected by</th><th class="r">Amount</th></tr></thead>
          <tbody>
            @for (x of rows(); track $index) {
              <tr>
                <td class="nw">{{ x.receivedOn | date: 'd MMM y' }}</td>
                <td class="nw pcr-code">{{ x.receiptCode }}@if (isPart(x)) { <small> · inst. {{ x.instalmentNo }}</small> }</td>
                <td class="nw pcr-code">{{ x.admissionCode || '—' }}</td>
                <td><a [routerLink]="['/preschool/students', x.studentId]">{{ x.childName }}</a>
                  @if (x.joinedOn) { <small class="pcr-sub">joined {{ x.joinedOn | date: 'd MMM y' }}</small> }</td>
                <td class="nw">{{ x.className }}@if (x.section) { · {{ x.section }} }</td>
                <td>{{ x.parentName }}@if (x.phone) { <small class="pcr-sub">{{ x.phone }}</small> }</td>
                <td class="r">{{ x.admissionFee ? money(x.admissionFee) : '—' }}</td>
                <td class="r">{{ x.monthlyFees ? money(x.monthlyFees) : '—' }}</td>
                <td class="r">{{ (x.otherFees ?? 0) - (x.discount ?? 0) ? money((x.otherFees ?? 0) - (x.discount ?? 0)) : '—' }}</td>
                <td>{{ x.mode }}@if (x.reference) { <small class="pcr-sub">{{ x.reference }}</small> }</td>
                <td>{{ x.collectedBy || '—' }}</td>
                <td class="r"><strong>{{ money(x.total) }}</strong></td>
              </tr>
            }
          </tbody>
          @if (rows().length) {
            <tfoot><tr><td colspan="6">Total</td><td class="r">{{ money(part('admissionFee')) }}</td><td class="r">{{ money(part('monthlyFees')) }}</td>
              <td class="r">{{ money(part('otherFees') - part('discount')) }}</td><td colspan="2"></td><td class="r">{{ money(total()) }}</td></tr></tfoot>
          }
        </table>
        @if (!rows().length) { <p class="app-muted pcr-empty">No fees received{{ filtered() ? ' that match' : '' }} between these dates.</p> }
      </div>
    }
  `,
  styles: [`
    .pcr-filters { display: flex; flex-direction: column; gap: 0.7rem; padding: 0.9rem 1rem; margin: 0.5rem 0 1rem; }
    .pcr-presets { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .pcr-presets button { padding: 0.4rem 0.85rem; border-radius: 999px; border: 1px solid var(--app-border); background: #fff; font: inherit;
      font-size: 0.85rem; font-weight: 600; cursor: pointer; }
    .pcr-presets button.on { border-color: #6d28d9; background: #f5f3ff; color: #4c1d95; }
    .pcr-range { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }
    .pcr-range label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; font-weight: 600; }
    .pcr-range input, .pcr-range select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .pcr-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); gap: 0.6rem; margin-bottom: 0.75rem; }
    .pcr-kpis div { padding: 0.7rem 0.9rem; border-radius: 12px; background: #fff; border: 1px solid var(--app-border); }
    .pcr-kpis span, .pcr-kpis small { display: block; font-size: 0.78rem; color: var(--app-text-muted); }
    .pcr-kpis strong { font-size: 1.2rem; }
    .pcr-kpi-main strong { color: #2b7a2b; font-size: 1.45rem; }
    .pcr-split { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
    .pcr-card { padding: 0.85rem 1rem; }
    .pcr-card h2 { margin: 0 0 0.5rem; font-size: 0.95rem; }
    .pcr-card p { display: flex; justify-content: space-between; gap: 0.75rem; margin: 0; padding: 0.3rem 0; border-bottom: 1px solid var(--app-border); font-size: 0.88rem; }
    .pcr-card p span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .pcr-actions { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
    .pcr-actions > span:last-child { display: flex; gap: 0.4rem; }
    .pcr-wrap { padding: 0; overflow-x: auto; }
    .pcr-table { width: 100%; min-width: 1180px; border-collapse: collapse; font-size: 0.86rem; }
    .pcr-table th { text-align: left; padding: 0.55rem 0.7rem; background: #f8f7fc; font-size: 0.7rem; text-transform: uppercase;
      letter-spacing: 0.03em; color: var(--app-text-muted); border-bottom: 1px solid var(--app-border); white-space: nowrap; }
    .pcr-table td { padding: 0.5rem 0.7rem; border-bottom: 1px solid var(--app-border); }
    .pcr-table tfoot td { font-weight: 700; background: #faf9fc; border-bottom: 0; }
    .pcr-code { font-family: ui-monospace, Consolas, monospace; font-size: 0.8rem; color: #4c1d95; }
    .pcr-code small { font-family: inherit; color: var(--app-text-muted); }
    .nw { white-space: nowrap; }
    .pcr-sub { display: block; font-size: 0.74rem; color: var(--app-text-muted); }
    .pcr-table a { color: inherit; text-decoration: none; font-weight: 700; }
    .pcr-table a:hover { text-decoration: underline; }
    .pcr-check { flex-direction: row !important; align-items: center; gap: 0.4rem !important; padding-bottom: 0.55rem; }
    .r { text-align: right; white-space: nowrap; }
    .pcr-empty { padding: 1rem; margin: 0; }
  `]
})
export class PreSchoolCollectionsReportComponent implements OnInit {
  private readonly students = inject(PreSchoolStudentService);

  readonly report = signal<PreSchoolCollectionReport | null>(null);
  readonly loading = signal(false);
  readonly preset = signal<Preset | null>('today');
  readonly mode = signal('');
  readonly collector = signal('');
  readonly className = signal('');
  /** Only payments that include admission fees (the admission receipt and its instalments). */
  readonly admissionOnly = signal(false);
  readonly money = formatMoney;

  from = iso(new Date());
  to = iso(new Date());

  readonly filtered = computed(() => !!(this.mode() || this.collector() || this.className() || this.admissionOnly()));
  readonly rows = computed(() => (this.report()?.rows ?? []).filter(x =>
    (!this.mode() || x.mode === this.mode()) &&
    (!this.collector() || (x.collectedBy || '(not recorded)') === this.collector()) &&
    (!this.className() || x.className === this.className()) &&
    (!this.admissionOnly() || x.admissionFee > 0)));
  readonly total = computed(() => this.rows().reduce((t, x) => t + x.total, 0));

  readonly modeNames = computed(() => Object.keys(this.report()?.byMode ?? {}));
  readonly collectorNames = computed(() => Object.keys(this.report()?.byCollector ?? {}));
  readonly classNames = computed(() => Object.keys(this.report()?.byClass ?? {}));

  readonly byMode = computed(() => this.group(x => x.mode));
  readonly byCollector = computed(() => this.group(x => x.collectedBy || '(not recorded)'));
  readonly byClass = computed(() => this.group(x => x.className || '—'));

  readonly title = computed(() => {
    const r = this.report();
    if (!r) return '';
    const parts = [r.from === r.to ? fmt(r.from) : `${fmt(r.from)} to ${fmt(r.to)}`];
    if (this.mode()) parts.push(this.mode());
    if (this.collector()) parts.push(`collected by ${this.collector()}`);
    if (this.className()) parts.push(this.className());
    if (this.admissionOnly()) parts.push('admission payments only');
    return parts.join(' · ');
  });

  ngOnInit(): void {
    this.usePreset('today');
  }

  usePreset(p: Preset): void {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    const range: Record<Preset, [Date, Date]> = {
      today: [now, now],
      yesterday: [new Date(y, m, d - 1), new Date(y, m, d - 1)],
      month: [new Date(y, m, 1), now],
      lastMonth: [new Date(y, m - 1, 1), new Date(y, m, 0)]
    };
    [this.from, this.to] = range[p].map(iso);
    this.preset.set(p);
    this.load();
  }

  load(): void {
    if (!this.from || !this.to || this.to < this.from) return;
    this.loading.set(true);
    this.students.collections(this.from, this.to).subscribe({
      next: r => { this.report.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  isPart(x: PreSchoolIncomeReceiptLine): boolean {
    return (x.instalmentNo ?? 1) > 1 || (x.billTotal ?? x.total) !== x.total;
  }

  part(key: 'admissionFee' | 'monthlyFees' | 'otherFees' | 'discount'): number {
    return this.rows().reduce((t, x) => t + (Number(x[key]) || 0), 0);
  }

  private group(by: (x: PreSchoolIncomeReceiptLine) => string): { name: string; amount: number }[] {
    const totals = new Map<string, number>();
    for (const x of this.rows()) totals.set(by(x), (totals.get(by(x)) ?? 0) + x.total);
    return [...totals].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }

  excel(): void {
    const rows = this.rows();
    downloadCsv(`Avijan-PreSchool-fee-collection-${this.from}-to-${this.to}`, [
      { title: `Avijan PreSchool — Fee collection report — ${this.title()}`, header: ['', 'Amount'], rows: [
        ['Collected', this.total()], ['Payments', rows.length], ...this.byMode().map(m => [m.name, m.amount] as (string | number)[])] },
      { title: 'By who collected', header: ['Login', 'Amount'], rows: this.byCollector().map(c => [c.name, c.amount]) },
      { title: 'Payments', header: ['Date', 'Receipt', 'Instalment', 'Admission No.', 'Child', 'Joined', 'Class', 'Section', 'Parent', 'Phone',
          'Admission', 'Monthly', 'Other', 'Discount', 'Mode', 'Reference', 'Collected by', 'Amount', 'Receipt total'],
        rows: rows.map(x => [x.receivedOn, x.receiptCode, x.instalmentNo ?? 1, x.admissionCode ?? '', x.childName, x.joinedOn ?? '', x.className,
          x.section ?? '', x.parentName ?? '', x.phone ?? '', x.admissionFee, x.monthlyFees, x.otherFees ?? 0, -(x.discount ?? 0),
          x.mode, x.reference ?? '', x.collectedBy ?? '', x.total, x.billTotal ?? x.total]) }
    ]);
  }

  print(): void {
    const e = escapeHtml, m = this.money;
    const line = (a: string, b: string) => `<tr><td>${a}</td><td class="r">${b}</td></tr>`;
    const body = this.rows().map(x => `<tr><td>${e(fmt(x.receivedOn))}</td><td>${e(x.receiptCode)}${this.isPart(x) ? ` <small>(inst. ${x.instalmentNo})</small>` : ''}</td>
      <td>${e(x.childName)}<br><small>${e(x.admissionCode ?? '')}${x.joinedOn ? ' · joined ' + e(fmt(x.joinedOn)) : ''}</small></td>
      <td>${e(x.className)}</td><td>${e(x.parentName ?? '')}<br><small>${e(x.phone ?? '')}</small></td>
      <td>${e(x.mode)}</td><td>${e(x.collectedBy ?? '')}</td><td class="r">${e(m(x.total))}</td></tr>`).join('');
    openDocumentWindow(`<!doctype html><html><head><meta charset="utf-8"><title>Avijan PreSchool — Fee collection ${e(this.title())}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#1f2433}h1{margin:0}h2{font-size:14px;margin:18px 0 6px}p{color:#5b6178}
      table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border-bottom:1px solid #e4e6ef;padding:6px 5px;text-align:left}
      th{font-size:11px;text-transform:uppercase;color:#6b7088}.r{text-align:right}tfoot td{font-weight:700}small{color:#6b7088}
      .two{display:flex;gap:24px}.two table{width:auto;min-width:220px}
      button{margin-top:16px;padding:8px 18px;border:0;border-radius:999px;background:#6d28d9;color:#fff;font-weight:600}@media print{button{display:none}}</style></head>
      <body><h1>Avijan PreSchool — Fee collection report</h1><p>${e(this.title())} · ${this.rows().length} payment(s) · cancelled receipts are left out.</p>
      <div class="two">
        <div><h2>By mode</h2><table><tbody>${this.byMode().map(x => line(e(x.name), e(m(x.amount)))).join('')}${line('<b>Total</b>', `<b>${e(m(this.total()))}</b>`)}</tbody></table></div>
        <div><h2>By who collected</h2><table><tbody>${this.byCollector().map(x => line(e(x.name), e(m(x.amount)))).join('')}</tbody></table></div>
      </div>
      <h2>Payments</h2>
      <table><thead><tr><th>Date</th><th>Receipt</th><th>Child</th><th>Class</th><th>Parent</th><th>Mode</th><th>Collected by</th><th class="r">Amount</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td colspan="7">Total</td><td class="r">${e(m(this.total()))}</td></tr></tfoot></table>
      <button onclick="window.print()">Print / Save as PDF</button></body></html>`);
  }
}
