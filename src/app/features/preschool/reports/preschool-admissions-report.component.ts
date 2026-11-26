import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolClass, todayIso } from '../../../core/models/preschool.model';
import { PreSchoolAdmissionReport, PreSchoolAdmissionRow, monthLabel } from '../../../core/models/preschool-student.model';
import { downloadCsv } from '../../../core/printing/csv-download';
import { escapeHtml, openDocumentWindow } from '../../../core/printing/legacy-documents';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolStudentService } from '../../../core/services/preschool-student.service';

const iso = (d: Date) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
const fmt = (value: string) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

type Preset = 'month' | 'lastMonth' | 'session' | 'year';

/**
 * Admissions between any two dates (by joining date): every child admitted,
 * month by month, with what their admission receipt billed, what has been
 * received (instalments included) and what is still to come. Downloads as
 * Excel or PDF.
 */
@Component({
  selector: 'app-preschool-admissions-report',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool · Reports</span>
      <h1>Admission report</h1>
      <p class="app-muted">Children admitted between any two dates (by joining date), with their admission fees billed, received and still due.</p>
    </div>

    <div class="app-card par-filters">
      <div class="par-presets" role="group" aria-label="Quick dates">
        <button type="button" [class.on]="preset() === 'month'" (click)="usePreset('month')">This month</button>
        <button type="button" [class.on]="preset() === 'lastMonth'" (click)="usePreset('lastMonth')">Last month</button>
        <button type="button" [class.on]="preset() === 'session'" (click)="usePreset('session')">This session (Apr–Mar)</button>
        <button type="button" [class.on]="preset() === 'year'" (click)="usePreset('year')">This year</button>
      </div>
      <div class="par-range">
        <label>From <input type="date" [(ngModel)]="from" [max]="to" (ngModelChange)="preset.set(null)" /></label>
        <label>To <input type="date" [(ngModel)]="to" [min]="from" (ngModelChange)="preset.set(null)" /></label>
        <label>Class
          <select [(ngModel)]="classId">
            <option [ngValue]="null">All classes</option>
            @for (c of classes(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
          </select></label>
        <p-button label="Show" icon="pi pi-search" [loading]="loading()" [disabled]="!from || !to || to < from" (onClick)="load()" />
      </div>
    </div>

    @if (report(); as r) {
      <div class="par-kpis">
        <div><span>Admissions</span><strong>{{ r.total }}</strong></div>
        <div><span>Admission receipts billed</span><strong>{{ money(r.billed ?? 0) }}</strong></div>
        <div><span>Received so far</span><strong>{{ money(r.paid ?? 0) }}</strong></div>
        <div class="par-kpi-due"><span>Still to come (instalments)</span><strong>{{ money(r.balance ?? 0) }}</strong></div>
      </div>

      @if (classCounts(r.byClass ?? {}).length) {
        <div class="par-classes">By class: @for (c of classCounts(r.byClass ?? {}); track c.name) { <em>{{ c.name }} {{ c.count }}</em> }</div>
      }

      @if (r.months.length > 1) {
        <div class="app-card par-chart" [style.grid-template-columns]="'repeat(' + r.months.length + ', minmax(1.6rem, 1fr))'" aria-label="Admissions per month">
          @for (m of r.months; track m.month) {
            <div class="par-bar" [attr.aria-label]="label(m.month) + ': ' + m.count">
              <span class="par-count">{{ m.count || '' }}</span>
              <span class="par-fill" [style.height.%]="peak() ? (m.count / peak()) * 100 : 0"></span>
              <span class="par-mon">{{ label(m.month) }}</span>
            </div>
          }
        </div>
      }

      <div class="par-actions">
        <span class="app-muted">{{ fmt(r.from ?? from) }} to {{ fmt(r.to ?? to) }}</span>
        <span>
          <p-button label="Excel" icon="pi pi-file-excel" severity="secondary" [outlined]="true" size="small" [disabled]="!r.total" (onClick)="excel()" />
          <p-button label="PDF / Print" icon="pi pi-print" severity="secondary" [outlined]="true" size="small" [disabled]="!r.total" (onClick)="print()" />
        </span>
      </div>

      <div class="app-card par-wrap">
        <table class="par-table">
          <thead>
            <tr><th>Joined</th><th>Adm. No.</th><th>Child</th><th>Class</th><th>Sec.</th><th>Parent</th><th>Phone</th><th>Status</th>
              <th class="r">Billed</th><th class="r">Received</th><th class="r">Balance</th></tr>
          </thead>
          <tbody>
            @for (m of r.months; track m.month) {
              @if (m.count) {
                <tr class="par-month"><td colspan="11">{{ label(m.month) }} · {{ m.count }} admission{{ m.count === 1 ? '' : 's' }}</td></tr>
                @for (c of m.children; track c.studentId) {
                  <tr>
                    <td class="nw">{{ c.joinedOn | date: 'd MMM y' }}</td>
                    <td class="par-code">{{ c.admissionCode }}</td>
                    <td><a [routerLink]="['/preschool/students', c.studentId]"><strong>{{ c.childName }}</strong></a></td>
                    <td>{{ c.className }}</td>
                    <td>{{ c.section || '—' }}</td>
                    <td>{{ c.parentName }}</td>
                    <td class="nw"><a [href]="'tel:' + c.phone">{{ c.phone }}</a></td>
                    <td>{{ c.status === 'Active' ? 'Studying' : c.status }}</td>
                    <td class="r">{{ c.billed ? money(c.billed) : '—' }}</td>
                    <td class="r">{{ c.billed ? money(c.paid ?? 0) : '—' }}</td>
                    <td class="r">
                      @if (!c.billed) { <span class="par-none">not collected</span> }
                      @else if ((c.balance ?? 0) > 0) { <span class="par-due">{{ money(c.balance ?? 0) }}</span> }
                      @else { <span class="par-ok">Paid</span> }
                    </td>
                  </tr>
                }
              }
            }
          </tbody>
          @if (r.total) {
            <tfoot><tr><td colspan="8">Total · {{ r.total }} admission{{ r.total === 1 ? '' : 's' }}</td>
              <td class="r">{{ money(r.billed ?? 0) }}</td><td class="r">{{ money(r.paid ?? 0) }}</td><td class="r">{{ money(r.balance ?? 0) }}</td></tr></tfoot>
          }
        </table>
        @if (!r.total) { <p class="app-muted par-empty">No admissions between these dates.</p> }
      </div>
    }
  `,
  styles: [`
    .par-filters { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.9rem 1rem; margin: 0.5rem 0 1rem; }
    .par-presets { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .par-presets button { padding: 0.4rem 0.85rem; border-radius: 999px; border: 1px solid var(--app-border); background: #fff; font: inherit;
      font-size: 0.85rem; font-weight: 600; cursor: pointer; }
    .par-presets button.on { border-color: #ff6b8b; background: #fff0f4; color: #b3264f; }
    .par-range { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }
    .par-range label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; font-weight: 600; }
    .par-range input, .par-range select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .par-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
    .par-kpis div { padding: 0.8rem 1rem; border-radius: 12px; background: #fff; border: 1px solid var(--app-border); }
    .par-kpis span { display: block; font-size: 0.8rem; color: var(--app-text-muted); }
    .par-kpis strong { font-size: 1.35rem; }
    .par-kpi-due strong { color: #b42318; }
    .par-classes { margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--app-text-muted); }
    .par-classes em { font-style: normal; display: inline-block; margin: 0 0.3rem 0.2rem 0; padding: 0.05rem 0.5rem; border-radius: 999px;
      background: #e3f2ff; color: #1d5fa8; font-size: 0.8rem; font-weight: 600; }
    .par-chart { display: grid; gap: 0.35rem; align-items: end; height: 10rem; padding: 1rem; margin-bottom: 0.75rem; overflow-x: auto; }
    .par-bar { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; min-width: 1.6rem; }
    .par-fill { width: 70%; min-height: 2px; border-radius: 6px 6px 0 0; background: #ff6b8b; }
    .par-count { font-size: 0.75rem; font-weight: 700; }
    .par-mon { font-size: 0.65rem; color: var(--app-text-muted); margin-top: 0.25rem; white-space: nowrap; }
    .par-actions { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
    .par-actions > span:last-child { display: flex; gap: 0.4rem; }
    .par-wrap { padding: 0; overflow-x: auto; }
    .par-table { width: 100%; min-width: 980px; border-collapse: collapse; font-size: 0.86rem; }
    .par-table th { text-align: left; padding: 0.55rem 0.7rem; background: #f8f7fc; font-size: 0.7rem; text-transform: uppercase;
      letter-spacing: 0.03em; color: var(--app-text-muted); border-bottom: 1px solid var(--app-border); white-space: nowrap; }
    .par-table td { padding: 0.5rem 0.7rem; border-bottom: 1px solid var(--app-border); }
    .par-table a { color: inherit; text-decoration: none; }
    .par-table a:hover { text-decoration: underline; }
    .par-month td { background: #fff7fa; font-weight: 700; font-size: 0.8rem; color: #b3264f; }
    .par-table tfoot td { font-weight: 700; background: #faf9fc; border-bottom: 0; }
    .par-code { font-family: ui-monospace, Consolas, monospace; font-size: 0.8rem; color: #4c1d95; white-space: nowrap; }
    .nw { white-space: nowrap; }
    .r { text-align: right; white-space: nowrap; }
    .par-due { color: #b42318; font-weight: 700; }
    .par-ok { color: #2b7a2b; font-weight: 700; }
    .par-none { color: var(--app-text-muted); font-size: 0.8rem; }
    .par-empty { padding: 1rem; margin: 0; }
  `]
})
export class PreSchoolAdmissionsReportComponent implements OnInit {
  private readonly students = inject(PreSchoolStudentService);
  private readonly preschool = inject(PreSchoolService);

  readonly report = signal<PreSchoolAdmissionReport | null>(null);
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly loading = signal(false);
  readonly preset = signal<Preset | null>('session');
  readonly money = formatMoney;
  readonly label = monthLabel;
  readonly fmt = fmt;

  from = '';
  to = todayIso();
  classId: number | null = null;

  readonly peak = computed(() => Math.max(0, ...(this.report()?.months ?? []).map(m => m.count)));

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes));
    this.usePreset('session');
  }

  usePreset(p: Preset): void {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const range: Record<Preset, [Date, Date]> = {
      month: [new Date(y, m, 1), new Date(y, m + 1, 0)],
      lastMonth: [new Date(y, m - 1, 1), new Date(y, m, 0)],
      // The school year runs April to March.
      session: m >= 3 ? [new Date(y, 3, 1), new Date(y + 1, 2, 31)] : [new Date(y - 1, 3, 1), new Date(y, 2, 31)],
      year: [new Date(y, 0, 1), new Date(y, 11, 31)]
    };
    [this.from, this.to] = range[p].map(iso);
    this.preset.set(p);
    this.load();
  }

  load(): void {
    if (!this.from || !this.to || this.to < this.from) return;
    this.loading.set(true);
    this.students.admissions(this.from, this.to, this.classId).subscribe({
      next: r => { this.report.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  classCounts(byClass: Record<string, number>): { name: string; count: number }[] {
    return Object.entries(byClass).map(([name, count]) => ({ name, count }));
  }

  private rows(): PreSchoolAdmissionRow[] {
    return (this.report()?.months ?? []).flatMap(m => m.children);
  }

  private get title(): string {
    const cls = this.classes().find(c => c.id === this.classId)?.name;
    return `${fmt(this.from)} to ${fmt(this.to)}${cls ? ` · ${cls}` : ''}`;
  }

  excel(): void {
    const r = this.report();
    if (!r) return;
    downloadCsv(`Avijan-PreSchool-admissions-${this.from}-to-${this.to}`, [
      { title: `Avijan PreSchool — Admission report — ${this.title}`, header: ['', 'Amount'], rows: [
        ['Admissions', r.total], ['Admission receipts billed', r.billed ?? 0], ['Received so far', r.paid ?? 0], ['Still to come', r.balance ?? 0]] },
      { title: 'Children admitted', header: ['Joined', 'Admission No.', 'Child', 'Date of birth', 'Class', 'Section', 'Parent', 'Phone', 'Status', 'Billed', 'Received', 'Balance'],
        rows: this.rows().map(c => [c.joinedOn, c.admissionCode, c.childName, c.dateOfBirth ?? '', c.className, c.section ?? '', c.parentName, c.phone,
          c.status, c.billed ?? 0, c.paid ?? 0, c.balance ?? 0]) }
    ]);
  }

  print(): void {
    const r = this.report();
    if (!r) return;
    const e = escapeHtml, m = this.money;
    const body = this.rows().map(c => `<tr><td>${e(fmt(c.joinedOn))}</td><td>${e(c.admissionCode)}</td><td>${e(c.childName)}</td>
      <td>${e(c.className)}${c.section ? ` ${e(c.section)}` : ''}</td><td>${e(c.parentName)}<br><small>${e(c.phone)}</small></td>
      <td class="r">${c.billed ? e(m(c.billed)) : '—'}</td><td class="r">${c.billed ? e(m(c.paid ?? 0)) : '—'}</td>
      <td class="r">${c.billed ? e(m(c.balance ?? 0)) : 'not collected'}</td></tr>`).join('');
    openDocumentWindow(`<!doctype html><html><head><meta charset="utf-8"><title>Avijan PreSchool — Admissions ${e(this.title)}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#1f2433}h1{margin:0}p{color:#5b6178}
      table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border-bottom:1px solid #e4e6ef;padding:6px 5px;text-align:left;vertical-align:top}
      th{font-size:11px;text-transform:uppercase;color:#6b7088}.r{text-align:right}tfoot td{font-weight:700}small{color:#6b7088}
      button{margin-top:16px;padding:8px 18px;border:0;border-radius:999px;background:#6d28d9;color:#fff;font-weight:600}@media print{button{display:none}}</style></head>
      <body><h1>Avijan PreSchool — Admission report</h1>
      <p>${e(this.title)} · ${r.total} admission${r.total === 1 ? '' : 's'} · billed ${e(m(r.billed ?? 0))}, received ${e(m(r.paid ?? 0))}, still to come ${e(m(r.balance ?? 0))}</p>
      <table><thead><tr><th>Joined</th><th>Adm. No.</th><th>Child</th><th>Class</th><th>Parent</th><th class="r">Billed</th><th class="r">Received</th><th class="r">Balance</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="5">Total</td><td class="r">${e(m(r.billed ?? 0))}</td><td class="r">${e(m(r.paid ?? 0))}</td><td class="r">${e(m(r.balance ?? 0))}</td></tr></tfoot></table>
      <button onclick="window.print()">Print / Save as PDF</button></body></html>`);
  }
}
