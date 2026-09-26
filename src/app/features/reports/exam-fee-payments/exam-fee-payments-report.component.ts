import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { ExamFeePaymentRow, ExamFeeRate } from '../../../core/models/exam-fee.model';
import { ExamFeeService } from '../../../core/services/exam-fee.service';
import { downloadCsv, reportFileName, toIsoDate } from '../report-utils';

type GroupBy = 'month' | 'year' | 'course' | 'student';

interface GroupRow {
  key: string;
  label: string;
  sub?: string;
  count: number;
  cash: number;
  bank: number;
  amount: number;
}

/**
 * Who has paid exam fee: every receipt in a range, with a summary by month,
 * year, course or student (registration id) and who received each one.
 */
@Component({
  selector: 'app-exam-fee-payments-report',
  imports: [CommonModule, FormsModule, ButtonModule, DatePickerModule, InputTextModule, SelectModule, TableModule, TagModule],
  styleUrls: ['../report.shared.scss'],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Reports</span>
      <h1>Exam fee receipts</h1>
      <p class="app-muted">Who has paid exam fee, when, for which course, and who received it.</p>
    </div>

    <section class="app-card xfr__filters">
      <label>From
        <p-datepicker [(ngModel)]="from" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" />
      </label>
      <label>To
        <p-datepicker [(ngModel)]="to" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" />
      </label>
      <label>Branch
        <p-select [options]="branchOptions()" [(ngModel)]="branch" optionLabel="label" optionValue="value" appendTo="body" />
      </label>
      <label>Course
        <p-select [options]="courseOptions()" [(ngModel)]="courseId" optionLabel="label" optionValue="value"
                  [filter]="true" appendTo="body" />
      </label>
      <label>Registration id
        <input pInputText [(ngModel)]="registrationId" placeholder="e.g. AVI/4867/26" (keyup.enter)="load()" />
      </label>
      <div class="xfr__actions">
        <p-button label="Run" icon="pi pi-search" [loading]="loading()" (onClick)="load()" />
        <p-button label="CSV" icon="pi pi-download" severity="secondary" [text]="true"
                  [disabled]="!rows().length" (onClick)="exportCsv()" />
      </div>
    </section>

    <div class="rpt__tiles">
      <div class="app-card rpt__tile"><span>Total received</span><strong>{{ money(total()) }}</strong></div>
      <div class="app-card rpt__tile"><span>Cash</span><strong>{{ money(cash()) }}</strong></div>
      <div class="app-card rpt__tile"><span>Bank</span><strong>{{ money(total() - cash()) }}</strong></div>
      <div class="app-card rpt__tile"><span>Students paid</span><strong>{{ studentCount() }}</strong>
        <small class="app-muted">{{ rows().length }} payment(s)</small></div>
    </div>

    <section class="app-card xfr__section">
      <header class="xfr__head">
        <h2>Summary</h2>
        <p-select [options]="groupOptions" [ngModel]="groupBy()" (ngModelChange)="groupBy.set($event)"
                  optionLabel="label" optionValue="value" />
      </header>
      <p-table [value]="groups()" styleClass="p-datatable-sm" [paginator]="groups().length > 20" [rows]="20">
        <ng-template pTemplate="header">
          <tr>
            <th>{{ groupTitle() }}</th>
            <th class="rpt__num" style="width: 7rem">Payments</th>
            <th class="rpt__num" style="width: 9rem">Cash</th>
            <th class="rpt__num" style="width: 9rem">Bank</th>
            <th class="rpt__num" style="width: 9rem">Total</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-g>
          <tr>
            <td><strong>{{ g.label }}</strong> @if (g.sub) { <span class="app-muted"> · {{ g.sub }}</span> }</td>
            <td class="rpt__num">{{ g.count }}</td>
            <td class="rpt__num">{{ money(g.cash) }}</td>
            <td class="rpt__num">{{ money(g.bank) }}</td>
            <td class="rpt__num"><strong>{{ money(g.amount) }}</strong></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="5" class="app-muted">No exam fee received in this range.</td></tr>
        </ng-template>
      </p-table>
    </section>

    <section class="app-card xfr__section">
      <header class="xfr__head"><h2>Every receipt</h2></header>
      <p-table [value]="rows()" [loading]="loading()" styleClass="p-datatable-sm"
               [paginator]="rows().length > 25" [rows]="25" [scrollable]="true">
        <ng-template pTemplate="header">
          <tr>
            <th style="width: 7rem">Date</th>
            <th>Registration</th>
            <th>Student</th>
            <th>Course</th>
            <th>Branch</th>
            <th class="rpt__num">Amount</th>
            <th>Mode</th>
            <th>Received by</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr>
            <td>{{ r.paidOn | date: 'd MMM y' }}</td>
            <td><code class="rpt__code">{{ r.registrationId || '—' }}</code></td>
            <td><strong>{{ r.studentName || '—' }}</strong></td>
            <td>{{ r.courseName || '—' }}</td>
            <td>{{ r.branch || '—' }}</td>
            <td class="rpt__num">{{ money(r.amount) }}</td>
            <td><p-tag [severity]="r.paymentMode === 'Bank' ? 'info' : 'success'" [value]="r.paymentMode" /></td>
            <td>{{ r.receivedBy || '—' }}</td>
          </tr>
        </ng-template>
      </p-table>
    </section>
  `,
  styles: `
    .xfr__filters { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: flex-end; margin-bottom: 1rem; }
    .xfr__filters label { display: grid; gap: 0.3rem; font-size: 0.8rem; min-width: 11rem; }
    .xfr__actions { display: flex; gap: 0.4rem; }
    .xfr__section { margin-top: 1rem; }
    .xfr__head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
    .xfr__head h2 { margin: 0; font-size: 1.05rem; }
  `
})
export class ExamFeePaymentsReportComponent implements OnInit {
  private readonly fees = inject(ExamFeeService);

  from: Date | null = new Date(new Date().getFullYear(), 0, 1);
  to: Date | null = new Date();
  branch: string | null = null;
  courseId: number | null = null;
  registrationId = '';

  readonly loading = signal(false);
  readonly rows = signal<ExamFeePaymentRow[]>([]);
  readonly rates = signal<ExamFeeRate[]>([]);
  readonly groupBy = signal<GroupBy>('month');

  readonly groupOptions = [
    { label: 'Month wise', value: 'month' },
    { label: 'Year wise', value: 'year' },
    { label: 'Course wise', value: 'course' },
    { label: 'Student (reg. id) wise', value: 'student' }
  ];

  readonly branchOptions = computed(() => [
    { label: 'All branches', value: null },
    ...[...new Set(this.rates().map(r => r.branch))].sort().map(b => ({ label: b, value: b }))
  ]);

  readonly courseOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const r of this.rates()) seen.set(r.courseId, r.courseName ?? `Course ${r.courseId}`);
    return [
      { label: 'All courses', value: null },
      ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ label, value }))
    ];
  });

  readonly total = computed(() => this.rows().reduce((s, r) => s + r.amount, 0));
  readonly cash = computed(() => this.rows().filter(r => r.paymentMode !== 'Bank').reduce((s, r) => s + r.amount, 0));
  readonly studentCount = computed(() => new Set(this.rows().map(r => r.studentId)).size);

  readonly groupTitle = computed(() =>
    ({ month: 'Month', year: 'Year', course: 'Course', student: 'Student' })[this.groupBy()]);

  readonly groups = computed<GroupRow[]>(() => {
    const by = this.groupBy();
    const map = new Map<string, GroupRow>();
    for (const r of this.rows()) {
      const d = new Date(r.paidOn + 'T00:00:00');
      let key: string, label: string, sub: string | undefined;
      switch (by) {
        case 'month':
          key = r.paidOn.slice(0, 7);
          label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
          break;
        case 'year':
          key = r.paidOn.slice(0, 4);
          label = key;
          break;
        case 'course':
          key = String(r.courseId ?? 0);
          label = r.courseName || 'No course';
          break;
        default:
          key = String(r.studentId);
          label = r.registrationId || '—';
          sub = [r.studentName, r.courseName].filter(Boolean).join(' · ');
      }
      const g = map.get(key) ?? { key, label, sub, count: 0, cash: 0, bank: 0, amount: 0 };
      g.count++;
      g.amount += r.amount;
      if (r.paymentMode === 'Bank') g.bank += r.amount; else g.cash += r.amount;
      map.set(key, g);
    }
    const list = [...map.values()];
    return by === 'month' || by === 'year'
      ? list.sort((a, b) => b.key.localeCompare(a.key))
      : list.sort((a, b) => a.label.localeCompare(b.label));
  });

  ngOnInit(): void {
    this.fees.rates().subscribe({ next: r => this.rates.set(r) });
    this.load();
  }

  load(): void {
    const from = toIsoDate(this.from);
    const to = toIsoDate(this.to);
    if (!from || !to) return;
    this.loading.set(true);
    this.fees.payments({ from, to, branch: this.branch, courseId: this.courseId, registrationId: this.registrationId })
      .subscribe({
        next: rows => { this.rows.set(rows); this.loading.set(false); },
        error: () => this.loading.set(false)
      });
  }

  exportCsv(): void {
    downloadCsv(
      reportFileName('exam-fee-receipts'),
      ['S.No', 'Date', 'Registration', 'Student', 'Course', 'Branch', 'Amount', 'Mode', 'Received by'],
      this.rows().map((r, i) => [
        i + 1, r.paidOn, r.registrationId ?? '', r.studentName ?? '', r.courseName ?? '',
        r.branch ?? '', r.amount, r.paymentMode, r.receivedBy ?? ''
      ])
    );
  }

  money(v: number): string {
    return '₹' + (v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
}
