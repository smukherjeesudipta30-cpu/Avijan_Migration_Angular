import { downloadBlob } from '../../../core/printing/download-file';
import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';

import { TeacherEarningsReport, TeachersEarningsReport } from '../../../core/models/report.model';
import { TeacherLookup } from '../../../core/models/student.model';
import { ReportService } from '../../../core/services/report.service';
import { StudentService } from '../../../core/services/student.service';
import { toIsoDate } from '../report-utils';

/**
 * Earnings for several teachers at once over a date range: earned (fee share
 * plus admission referral), any missed-scan-out deduction, paid and balance -
 * each figure exactly as the teacher's own account computes it - with every
 * earning line, and a PDF or Excel file of the whole report.
 */
@Component({
  selector: 'app-teachers-earnings-report',
  imports: [CommonModule, FormsModule, ButtonModule, DatePickerModule, MultiSelectModule, TableModule],
  styleUrls: ['../report.shared.scss'],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Reports</span>
      <h1>Teacher earnings</h1>
      <p class="app-muted">
        Earned, paid and balance for the teachers you choose, over any date range. Download it as a PDF or an Excel file.
      </p>
    </div>

    <section class="app-card ter__filters">
      <label>From
        <p-datepicker [(ngModel)]="from" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" />
      </label>
      <label>To
        <p-datepicker [(ngModel)]="to" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" />
      </label>
      <label class="ter__teachers">Teachers
        <p-multiselect
          [options]="teacherOptions()"
          [ngModel]="selected()"
          (ngModelChange)="selected.set($event)"
          optionLabel="name"
          optionValue="teacherId"
          [filter]="true"
          filterPlaceHolder="Search teachers"
          [showToggleAll]="true"
          display="chip"
          [maxSelectedLabels]="4"
          selectedItemsLabel="{0} teachers selected"
          placeholder="Choose one or more teachers"
          appendTo="body"
          styleClass="ter__select" />
      </label>
      <div class="ter__actions">
        <p-button label="Run" icon="pi pi-search" [loading]="loading()" [disabled]="!canRun()" (onClick)="load()" />
        <p-button label="Download PDF" icon="pi pi-file-pdf" severity="secondary"
                  [loading]="downloading() === 'pdf'" [disabled]="!canRun() || !!downloading()" (onClick)="download('pdf')" />
        <p-button label="Download Excel" icon="pi pi-file-excel" severity="secondary"
                  [loading]="downloading() === 'excel'" [disabled]="!canRun() || !!downloading()" (onClick)="download('excel')" />
      </div>
    </section>

    @if (report(); as r) {
      <div class="rpt__tiles">
        <div class="app-card rpt__tile"><span>Earned</span><strong>{{ money(r.totalEarned) }}</strong>
          <small class="app-muted">{{ r.teachers.length }} teacher(s)</small></div>
        @if (r.totalDeduction) {
          <div class="app-card rpt__tile"><span>Deduction</span><strong>{{ money(r.totalDeduction) }}</strong></div>
        }
        <div class="app-card rpt__tile"><span>Paid</span><strong>{{ money(r.totalPaid) }}</strong></div>
        <div class="app-card rpt__tile"><span>Balance</span><strong>{{ money(r.pending) }}</strong></div>
      </div>

      <section class="app-card ter__section">
        <header class="ter__head">
          <h2>Summary · {{ r.from | date: 'd MMM y' }} to {{ r.to | date: 'd MMM y' }}</h2>
          <span class="app-muted">Click a teacher to see their earnings line by line.</span>
        </header>
        <p-table [value]="r.teachers" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 3rem"></th>
              <th>Teacher</th>
              <th class="rpt__num">Earned</th>
              @if (r.totalDeduction) { <th class="rpt__num">Deduction</th> }
              <th class="rpt__num">Paid</th>
              <th class="rpt__num">Balance</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-t>
            <tr class="ter__row" (click)="toggle(t.teacherId)">
              <td><i class="pi" [class.pi-chevron-down]="isOpen(t.teacherId)" [class.pi-chevron-right]="!isOpen(t.teacherId)"></i></td>
              <td><strong>{{ t.teacherName || 'Teacher #' + t.teacherId }}</strong>
                @if (t.teacherPhone) { <span class="app-muted"> · {{ t.teacherPhone }}</span> }</td>
              <td class="rpt__num">{{ money(t.totalEarned) }}</td>
              @if (r.totalDeduction) { <td class="rpt__num">{{ money(t.totalDeduction) }}</td> }
              <td class="rpt__num">{{ money(t.totalPaid) }}</td>
              <td class="rpt__num"><strong [class.ter__owed]="t.pending > 0">{{ money(t.pending) }}</strong></td>
            </tr>
            @if (isOpen(t.teacherId)) {
            <tr>
              <td [attr.colspan]="r.totalDeduction ? 6 : 5" class="ter__detail">
                @if (!t.earnings.length) {
                  <p class="app-muted">No earnings in this period.</p>
                } @else {
                  <table class="ter__lines">
                    <thead><tr><th>Date</th><th>Student</th><th>Reg. no.</th><th>Course / source</th><th class="rpt__num">Amount</th></tr></thead>
                    <tbody>
                      @for (e of sortedEarnings(t); track $index) {
                        <tr>
                          <td>{{ e.paidOn | date: 'd MMM y' }}</td>
                          <td>{{ e.studentName || '—' }}</td>
                          <td><code class="rpt__code">{{ e.registrationId || '—' }}</code></td>
                          <td>{{ e.courseName || '—' }}</td>
                          <td class="rpt__num">{{ money(e.salary) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
                @for (d of t.deductions; track $index) {
                  <p class="app-muted">Deduction: {{ d.reason }} ({{ money(d.deductionAmount) }})</p>
                }
                @if (t.payments.length) {
                  <p><strong>Paid:</strong>
                    @for (p of t.payments; track p.expenseId; let last = $last) {
                      {{ p.paidOn | date: 'd MMM y' }} {{ money(p.amount) }}@if (!last) {, }
                    }
                  </p>
                }
              </td>
            </tr>
            }
          </ng-template>
          <ng-template pTemplate="footer">
            <tr>
              <td></td>
              <td><strong>Total</strong></td>
              <td class="rpt__num"><strong>{{ money(r.totalEarned) }}</strong></td>
              @if (r.totalDeduction) { <td class="rpt__num"><strong>{{ money(r.totalDeduction) }}</strong></td> }
              <td class="rpt__num"><strong>{{ money(r.totalPaid) }}</strong></td>
              <td class="rpt__num"><strong>{{ money(r.pending) }}</strong></td>
            </tr>
          </ng-template>
        </p-table>
      </section>
    } @else if (!loading()) {
      <section class="app-card ter__section">
        <p class="app-muted">Choose the dates and one or more teachers, then press Run, Download PDF or Download Excel.</p>
      </section>
    }

    @if (error()) {
      <p class="ter__error">{{ error() }}</p>
    }
  `,
  styles: `
    .ter__filters { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: flex-end; margin-bottom: 1rem; }
    .ter__filters label { display: grid; gap: 0.3rem; font-size: 0.8rem; min-width: 11rem; }
    .ter__teachers { flex: 1 1 18rem; }
    :host ::ng-deep .ter__select { width: 100%; }
    .ter__actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .ter__section { margin-top: 1rem; }
    .ter__head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
    .ter__head h2 { margin: 0; font-size: 1.05rem; }
    .ter__row { cursor: pointer; }
    .ter__owed { color: var(--app-danger, #b91c1c); }
    .ter__detail { background: color-mix(in srgb, currentColor 3%, transparent); }
    .ter__lines { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 0.5rem; }
    .ter__lines th, .ter__lines td { padding: 0.3rem 0.5rem; border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent); text-align: left; }
    .ter__lines .rpt__num { text-align: right; }
    .ter__error { color: var(--app-danger, #b91c1c); margin-top: 0.8rem; }
  `
})
export class TeachersEarningsReportComponent implements OnInit {
  private readonly reports = inject(ReportService);
  private readonly students = inject(StudentService);

  from: Date | null = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  to: Date | null = new Date();

  readonly teachers = signal<TeacherLookup[]>([]);
  readonly selected = signal<number[]>([]);
  readonly report = signal<TeachersEarningsReport | null>(null);
  readonly loading = signal(false);
  readonly downloading = signal<'pdf' | 'excel' | null>(null);
  readonly error = signal<string | null>(null);
  readonly open = signal<ReadonlySet<number>>(new Set());

  /** Real teachers only: placeholders stand in for teachers deleted from the legacy system. */
  readonly teacherOptions = computed(() =>
    this.teachers()
      .filter(t => !t.isPlaceholder)
      .sort((a, b) => a.name.localeCompare(b.name)));

  readonly canRun = computed(() => this.selected().length > 0);

  ngOnInit(): void {
    this.students.teachers().subscribe({ next: list => this.teachers.set(list) });
  }

  load(): void {
    const range = this.range();
    if (!range) return;

    this.loading.set(true);
    this.error.set(null);
    this.reports.teachersEarnings(this.selected(), range.from, range.to).subscribe({
      next: r => {
        this.report.set(r);
        this.open.set(new Set());
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  download(kind: 'pdf' | 'excel'): void {
    const range = this.range();
    if (!range) return;

    this.downloading.set(kind);
    this.error.set(null);
    this.reports.teachersEarningsFile(kind, this.selected(), range.from, range.to).subscribe({
      next: blob => {
        void downloadBlob(blob, `Teacher_Earnings_${range.from}_to_${range.to}.${kind === 'pdf' ? 'pdf' : 'xlsx'}`);
        this.downloading.set(null);
      },
      error: () => {
        this.error.set(`The ${kind === 'pdf' ? 'PDF' : 'Excel file'} could not be created. Please try again.`);
        this.downloading.set(null);
      }
    });
  }

  isOpen(id: number): boolean {
    return this.open().has(id);
  }

  toggle(id: number): void {
    const next = new Set(this.open());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.open.set(next);
  }

  sortedEarnings(t: TeacherEarningsReport) {
    return [...t.earnings].sort((a, b) => (a.paidOn ?? '').localeCompare(b.paidOn ?? ''));
  }

  money(v: number): string {
    return '₹' + (v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  private range(): { from: string; to: string } | null {
    const from = toIsoDate(this.from);
    const to = toIsoDate(this.to);
    if (!from || !to) {
      this.error.set('Choose both dates.');
      return null;
    }
    if (to < from) {
      this.error.set("The 'To' date cannot be before the 'From' date.");
      return null;
    }
    return { from, to };
  }
}
