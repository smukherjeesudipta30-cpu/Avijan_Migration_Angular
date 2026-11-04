import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolClass } from '../../../core/models/preschool.model';
import { PreSchoolAdmissionReport, monthLabel } from '../../../core/models/preschool-student.model';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolStudentService } from '../../../core/services/preschool-student.service';

/** Admissions month by month in a year, by joining date, with each month's children. */
@Component({
  selector: 'app-preschool-admissions-report',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool · Reports</span>
      <h1>Admissions by month</h1>
      <p class="app-muted">Children by the month they joined, with the admission fees received for them.</p>
    </div>

    <div class="par-filters">
      <p-button icon="pi pi-chevron-left" [text]="true" [rounded]="true" ariaLabel="Previous year" (onClick)="setYear(year() - 1)" />
      <strong>{{ year() }}</strong>
      <p-button icon="pi pi-chevron-right" [text]="true" [rounded]="true" ariaLabel="Next year" (onClick)="setYear(year() + 1)" />
      <select [(ngModel)]="classId" (ngModelChange)="load()">
        <option [ngValue]="null">All classes</option>
        @for (c of classes(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
      </select>
    </div>

    @if (report(); as r) {
      <div class="par-kpis">
        <div><span>Admissions in {{ r.year }}</span><strong>{{ r.total }}</strong></div>
        <div><span>Admission fees received</span><strong>{{ money(r.admissionFees) }}</strong></div>
        <div><span>Busiest month</span><strong>{{ busiest() }}</strong></div>
      </div>

      <div class="app-card par-chart" aria-label="Admissions per month">
        @for (m of r.months; track m.month) {
          <button type="button" class="par-bar" [class.par-bar--on]="open() === m.month" (click)="toggle(m.month)" [attr.aria-label]="label(m.month) + ': ' + m.count">
            <span class="par-count">{{ m.count || '' }}</span>
            <span class="par-fill" [style.height.%]="peak() ? (m.count / peak()) * 100 : 0"></span>
            <span class="par-mon">{{ label(m.month).slice(0, 3) }}</span>
          </button>
        }
      </div>

      <div class="app-card par-table">
        <div class="par-row par-row--head"><span>Month</span><span>Admissions</span><span>By class</span><span class="r">Admission fees</span></div>
        @for (m of r.months; track m.month) {
          <button type="button" class="par-row par-row--btn" (click)="toggle(m.month)" [disabled]="!m.count">
            <span>{{ label(m.month) }}</span>
            <span><strong>{{ m.count }}</strong></span>
            <span class="par-classes">@for (c of classCounts(m.byClass); track c.name) { <em>{{ c.name }} {{ c.count }}</em> }</span>
            <span class="r">{{ m.admissionFees ? money(m.admissionFees) : '—' }}</span>
          </button>
          @if (open() === m.month) {
            @for (c of m.children; track c.studentId) {
              <a class="par-child" [routerLink]="['/preschool/students', c.studentId]">
                <span>{{ c.joinedOn | date: 'd MMM' }}</span>
                <span><strong>{{ c.childName }}</strong> · {{ c.admissionCode }}</span>
                <span>{{ c.className }}</span>
                <span>{{ c.parentName }} · {{ c.phone }}</span>
                <span class="r">{{ c.admissionFeeReceived ? money(c.admissionFeeReceived) : 'not paid' }}</span>
              </a>
            }
          }
        }
        <div class="par-row par-row--total"><span>Total</span><span>{{ r.total }}</span><span></span><span class="r">{{ money(r.admissionFees) }}</span></div>
      </div>
    }
  `,
  styles: [`
    .par-filters { display: flex; gap: 0.5rem; align-items: center; margin: 0.5rem 0 1rem; }
    .par-filters select { margin-left: 0.75rem; padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .par-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .par-kpis div { padding: 0.8rem 1rem; border-radius: 12px; background: #fff; border: 1px solid var(--app-border); }
    .par-kpis span { display: block; font-size: 0.8rem; color: var(--app-text-muted); }
    .par-kpis strong { font-size: 1.4rem; }
    .par-chart { display: grid; grid-template-columns: repeat(12, 1fr); gap: 0.4rem; align-items: end; height: 11rem; padding: 1rem; margin-bottom: 1rem; }
    .par-bar { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; border: 0; background: none; cursor: pointer; padding: 0; font: inherit; }
    .par-fill { width: 70%; min-height: 2px; border-radius: 6px 6px 0 0; background: #ffc2d1; }
    .par-bar--on .par-fill, .par-bar:hover .par-fill { background: #ff6b8b; }
    .par-count { font-size: 0.78rem; font-weight: 700; }
    .par-mon { font-size: 0.72rem; color: var(--app-text-muted); margin-top: 0.25rem; }
    .par-table { padding: 0; overflow: hidden; }
    .par-row { display: grid; grid-template-columns: 1fr 0.7fr 2fr 1fr; gap: 0.6rem; align-items: center; padding: 0.6rem 1rem;
      border: 0; border-bottom: 1px solid var(--app-border); background: none; width: 100%; text-align: left; font: inherit; color: inherit; }
    .par-row--btn { cursor: pointer; }
    .par-row--btn:hover:not(:disabled) { background: #faf7ff; }
    .par-row--btn:disabled { cursor: default; color: var(--app-text-muted); }
    .par-row--head span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--app-text-muted); }
    .par-row--total { background: #faf9fc; font-weight: 700; border-bottom: 0; }
    .par-classes em { font-style: normal; display: inline-block; margin-right: 0.35rem; padding: 0.05rem 0.45rem; border-radius: 999px; background: #e3f2ff; color: #1d5fa8; font-size: 0.78rem; font-weight: 600; }
    .par-child { display: grid; grid-template-columns: 4.5rem 1.6fr 0.8fr 1.6fr 0.8fr; gap: 0.6rem; padding: 0.5rem 1rem 0.5rem 2rem;
      background: #fffafc; border-bottom: 1px solid var(--app-border); color: inherit; text-decoration: none; font-size: 0.88rem; }
    .r { text-align: right; }
    @media (max-width: 760px) { .par-row { grid-template-columns: 1fr auto auto; } .par-row > span:nth-child(3) { display: none; } .par-child { grid-template-columns: 1fr auto; } .par-child > span:nth-child(n+3):not(:last-child) { display: none; } }
  `]
})
export class PreSchoolAdmissionsReportComponent implements OnInit {
  private readonly students = inject(PreSchoolStudentService);
  private readonly preschool = inject(PreSchoolService);

  readonly year = signal(new Date().getFullYear());
  readonly report = signal<PreSchoolAdmissionReport | null>(null);
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly open = signal<string | null>(null);
  readonly money = formatMoney;
  readonly label = monthLabel;

  classId: number | null = null;

  readonly peak = computed(() => Math.max(0, ...(this.report()?.months ?? []).map(m => m.count)));
  readonly busiest = computed(() => {
    const months = this.report()?.months ?? [];
    const top = months.reduce<typeof months[number] | null>((best, m) => (!best || m.count > best.count ? m : best), null);
    return top && top.count ? monthLabel(top.month) : '—';
  });

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes));
    this.load();
  }

  setYear(y: number): void { this.year.set(y); this.load(); }

  load(): void {
    this.open.set(null);
    this.students.admissions(this.year(), this.classId).subscribe(r => this.report.set(r));
  }

  toggle(month: string): void { this.open.set(this.open() === month ? null : month); }

  classCounts(byClass: Record<string, number>): { name: string; count: number }[] {
    return Object.entries(byClass).map(([name, count]) => ({ name, count }));
  }
}
