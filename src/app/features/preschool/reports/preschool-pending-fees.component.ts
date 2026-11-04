import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolClass } from '../../../core/models/preschool.model';
import { PreSchoolPendingReport, PreSchoolPendingRow, monthLabel, whatsAppLink } from '../../../core/models/preschool-student.model';
import { escapeHtml, openDocumentWindow } from '../../../core/printing/legacy-documents';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolStudentService } from '../../../core/services/preschool-student.service';

/**
 * Children owing fees up to this month: which months, how much, with a
 * WhatsApp reminder per parent and a printable copy.
 */
@Component({
  selector: 'app-preschool-pending-fees',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule],
  template: `
    <div class="ppf-head">
      <div class="app-page-head">
        <span class="app-eyebrow">Avijan PreSchool · Reports</span>
        <h1>Pending fees</h1>
        <p class="app-muted">Every month from joining up to this month without a receipt, and admission fees not yet taken.</p>
      </div>
      <p-button label="Print / PDF" icon="pi pi-print" [outlined]="true" (onClick)="print()" [disabled]="!rows().length" />
    </div>

    <div class="ppf-filters">
      <select [(ngModel)]="classId" (ngModelChange)="load()">
        <option [ngValue]="null">All classes</option>
        @for (c of classes(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
      </select>
      <select [(ngModel)]="minMonths" (ngModelChange)="load()">
        <option [ngValue]="1">Owing 1 month or more</option>
        <option [ngValue]="2">Owing 2 months or more</option>
        <option [ngValue]="3">Owing 3 months or more</option>
      </select>
      <input pInputText placeholder="Child or parent name" [ngModel]="search()" (ngModelChange)="search.set($event)" />
    </div>

    <div class="ppf-kpis">
      <div><span>Children owing</span><strong>{{ rows().length }}</strong></div>
      <div><span>Months unpaid</span><strong>{{ monthsTotal() }}</strong></div>
      <div><span>Total pending</span><strong class="ppf-red">{{ money(amountTotal()) }}</strong></div>
    </div>

    <div class="app-card ppf-table">
      <div class="ppf-row ppf-row--head"><span>Child · parent</span><span>Class</span><span>Months due</span><span>Phone</span><span class="r">Pending</span><span></span></div>
      @for (r of rows(); track r.studentId) {
        <div class="ppf-row">
          <span><a [routerLink]="['/preschool/students', r.studentId]"><strong>{{ r.childName }}</strong></a><small>{{ r.parentName }}</small></span>
          <span>{{ r.className }}</span>
          <span>
            @if (r.months.length) { <span class="ppf-pill" [class.ppf-pill--late]="r.months.length >= 3">{{ r.months.length }} mth</span> {{ list(r.months) }} }
            @if (r.admissionDue > 0) { <span class="ppf-pill ppf-pill--adm">Admission {{ money(r.admissionDue) }}</span> }
          </span>
          <span><a [href]="'tel:' + r.phone">{{ r.phone }}</a></span>
          <span class="r"><strong>{{ money(r.amount) }}</strong></span>
          <span class="r"><a class="ppf-wa" [href]="remind(r)" target="_blank" rel="noopener" aria-label="WhatsApp reminder"><i class="pi pi-whatsapp" aria-hidden="true"></i></a></span>
        </div>
      } @empty {
        @if (report()) { <p class="app-muted ppf-empty">No pending fees. Everyone is paid up.</p> }
      }
      @if (rows().length) {
        <div class="ppf-row ppf-row--total"><span>Total</span><span></span><span>{{ monthsTotal() }} months</span><span></span><span class="r">{{ money(amountTotal()) }}</span><span></span></div>
      }
    </div>
  `,
  styles: [`
    .ppf-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .ppf-filters { display: flex; gap: 0.6rem; flex-wrap: wrap; margin: 0.5rem 0 1rem; }
    .ppf-filters select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .ppf-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .ppf-kpis div { padding: 0.8rem 1rem; border-radius: 12px; background: #fff; border: 1px solid var(--app-border); }
    .ppf-kpis span { display: block; font-size: 0.8rem; color: var(--app-text-muted); }
    .ppf-kpis strong { font-size: 1.4rem; }
    .ppf-red { color: #b42318; }
    .ppf-table { padding: 0; overflow: hidden; }
    .ppf-row { display: grid; grid-template-columns: 1.3fr 0.7fr 1.6fr 0.9fr 0.8fr 2.6rem; gap: 0.6rem; align-items: center;
      padding: 0.65rem 1rem; border-bottom: 1px solid var(--app-border); }
    .ppf-row span { min-width: 0; }
    .ppf-row a { color: inherit; }
    .ppf-row small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .ppf-row--head span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--app-text-muted); }
    .ppf-row--total { background: #faf9fc; font-weight: 700; border-bottom: 0; }
    .r { text-align: right; }
    .ppf-pill { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; background: #fff1d6; color: #7a4a00; font-size: 0.78rem; font-weight: 700; margin-right: 0.25rem; }
    .ppf-pill--late { background: #fde8e8; color: #b42318; }
    .ppf-pill--adm { background: #ede9fe; color: #5b21b6; }
    .ppf-wa { display: grid; place-items: center; width: 2.1rem; height: 2.1rem; border-radius: 50%; color: #1f9d55; text-decoration: none; margin-left: auto; }
    .ppf-empty { padding: 1rem; margin: 0; }
    @media (max-width: 800px) {
      .ppf-row { grid-template-columns: 1fr auto 2.6rem; }
      .ppf-row > span:nth-child(2), .ppf-row > span:nth-child(3), .ppf-row > span:nth-child(4) { display: none; }
    }
  `]
})
export class PreSchoolPendingFeesComponent implements OnInit {
  private readonly students = inject(PreSchoolStudentService);
  private readonly preschool = inject(PreSchoolService);

  readonly report = signal<PreSchoolPendingReport | null>(null);
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly search = signal('');
  readonly money = formatMoney;

  classId: number | null = null;
  minMonths = 1;

  /** The name search narrows the rows on screen; the totals follow it. */
  readonly rows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const all = this.report()?.rows ?? [];
    return q ? all.filter(r => `${r.childName} ${r.parentName}`.toLowerCase().includes(q)) : all;
  });
  readonly monthsTotal = computed(() => this.rows().reduce((n, r) => n + r.months.length, 0));
  readonly amountTotal = computed(() => this.rows().reduce((n, r) => n + r.amount, 0));

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes));
    this.load();
  }

  load(): void {
    this.students.pending(this.classId, this.minMonths).subscribe(r => this.report.set(r));
  }

  list(months: string[]): string {
    return months.map(monthLabel).join(', ');
  }

  remind(r: PreSchoolPendingRow): string {
    const parts = [];
    if (r.months.length) parts.push(`fees for ${this.list(r.months)}`);
    if (r.admissionDue > 0) parts.push('the admission fee');
    return whatsAppLink(r.phone,
      `Dear ${r.parentName}, this is a gentle reminder from Avijan PreSchool that ${parts.join(' and ')} for ${r.childName} ` +
      `(${this.money(r.amount)}) is pending. Please pay at the school office or by UPI. Thank you.`);
  }

  print(): void {
    const e = escapeHtml;
    const body = this.rows().map(r => `<tr><td>${e(r.childName)}<br><small>${e(r.parentName)}</small></td><td>${e(r.className)}</td>
      <td>${e(this.list(r.months))}${r.admissionDue > 0 ? `${r.months.length ? '; ' : ''}Admission ${e(this.money(r.admissionDue))}` : ''}</td>
      <td>${e(r.phone)}</td><td class="r">${e(this.money(r.amount))}</td></tr>`).join('');
    openDocumentWindow(`<!doctype html><html><head><meta charset="utf-8"><title>Avijan PreSchool — Pending fees</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#1f2433}h1{margin:0}p{color:#5b6178}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}th,td{border-bottom:1px solid #e4e6ef;padding:7px 5px;text-align:left;vertical-align:top}
      th{font-size:11px;text-transform:uppercase;color:#6b7088}.r{text-align:right}small{color:#6b7088}tfoot td{font-weight:700}
      button{margin-top:16px;padding:8px 18px;border:0;border-radius:999px;background:#ff6b8b;color:#fff;font-weight:600}@media print{button{display:none}}</style></head>
      <body><h1>Avijan PreSchool — Pending fees</h1><p>As on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <table><thead><tr><th>Child</th><th>Class</th><th>Due</th><th>Phone</th><th class="r">Pending</th></tr></thead><tbody>${body}</tbody>
      <tfoot><tr><td colspan="4">${this.rows().length} children · ${this.monthsTotal()} months</td><td class="r">${e(this.money(this.amountTotal()))}</td></tr></tfoot></table>
      <button onclick="window.print()">Print / Save as PDF</button></body></html>`);
  }
}
