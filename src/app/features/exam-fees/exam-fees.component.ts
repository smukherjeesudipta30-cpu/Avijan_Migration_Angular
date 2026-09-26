import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { ExamFeeDueRow, ExamFeeRate } from '../../core/models/exam-fee.model';
import { AuthService } from '../../core/services/auth.service';
import { ExamFeeService } from '../../core/services/exam-fee.service';
import { ExamFeeDialogComponent } from '../../shared/exam-fee/exam-fee-dialog.component';

/**
 * Exam fees: the fee for each course at each branch (set by Admin), and every
 * student scheduled for an exam who still owes it, with Collect beside them.
 */
@Component({
  selector: 'app-exam-fees',
  imports: [CommonModule, FormsModule, ButtonModule, InputNumberModule, TableModule, TagModule, ExamFeeDialogComponent],
  template: `
    <section class="app-card xf__section">
      <header class="xf__head">
        <div>
          <h2>Exam fee by course and branch</h2>
          <p class="app-muted">
            Charged once per course. A student's own amount, where Admin has set one, takes
            priority. Leave a fee blank if the course has no exam fee at that branch.
          </p>
        </div>
        @if (isAdmin()) {
          <p-button label="Save fees" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
        }
      </header>

      <p-table [value]="courses()" [loading]="loadingRates()" styleClass="p-datatable-sm" [scrollable]="true">
        <ng-template pTemplate="header">
          <tr>
            <th>Course</th>
            @for (b of branches(); track b) { <th style="width: 11rem">{{ b }}</th> }
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-course>
          <tr>
            <td>{{ course.courseName }}</td>
            @for (b of branches(); track b) {
              <td>
                @if (cell(course.courseId, b); as c) {
                  @if (isAdmin()) {
                    <p-inputNumber [(ngModel)]="c.amount" [min]="0" mode="currency" currency="INR" locale="en-IN"
                                   placeholder="Not set" styleClass="xf__amount" />
                  } @else {
                    {{ c.amount === null ? '—' : money(c.amount) }}
                  }
                }
              </td>
            }
          </tr>
        </ng-template>
      </p-table>
    </section>

    <section class="app-card xf__section">
      <header class="xf__head">
        <div>
          <h2>Students owing exam fee</h2>
          <p class="app-muted">Scheduled for, or already sat, an exam on their course and not fully paid.</p>
        </div>
        <strong class="xf__total">{{ money(totalDue()) }}</strong>
      </header>

      <p-table [value]="dues()" [loading]="loadingDues()" styleClass="p-datatable-sm" [paginator]="dues().length > 20" [rows]="20">
        <ng-template pTemplate="header">
          <tr>
            <th>Student</th>
            <th>Course</th>
            <th style="width: 8rem">Branch</th>
            <th class="xf__num" style="width: 8rem">Fee</th>
            <th class="xf__num" style="width: 8rem">Paid</th>
            <th class="xf__num" style="width: 8rem">Due</th>
            <th style="width: 8rem"></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-d>
          <tr>
            <td><strong>{{ d.studentName }}</strong><div class="app-muted xf__sub">{{ d.registrationId }}</div></td>
            <td class="xf__sub">{{ d.courseName }}</td>
            <td>{{ d.branch }}</td>
            <td class="xf__num">{{ money(d.examFee) }}</td>
            <td class="xf__num">{{ money(d.paid) }}</td>
            <td class="xf__num"><p-tag [value]="money(d.due)" severity="danger" /></td>
            <td><p-button label="Collect" icon="pi pi-wallet" size="small" [text]="true" (onClick)="open(d)" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="7" class="app-muted">Nobody owes exam fee right now.</td></tr>
        </ng-template>
      </p-table>
    </section>

    <app-exam-fee-dialog [(visible)]="dialogVisible" [studentId]="dialogStudentId()" (changed)="loadDues()" />
  `,
  styles: `
    .xf__section { margin-bottom: 1.25rem; }
    .xf__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 0.75rem; }
    .xf__head h2 { margin: 0 0 0.25rem; font-size: 1.1rem; }
    .xf__head p { margin: 0; font-size: 0.85rem; }
    .xf__total { font-size: 1.2rem; white-space: nowrap; }
    .xf__num { text-align: right; }
    .xf__sub { font-size: 0.8rem; }
    :host ::ng-deep .xf__amount input { width: 9rem; }
  `
})
export class ExamFeesComponent {
  private readonly api = inject(ExamFeeService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly isAdmin = computed(() => this.auth.hasAnyRole(['Admin']));

  readonly rates = signal<ExamFeeRate[]>([]);
  readonly loadingRates = signal(true);
  readonly saving = signal(false);

  readonly dues = signal<ExamFeeDueRow[]>([]);
  readonly loadingDues = signal(true);
  readonly totalDue = computed(() => this.dues().reduce((s, d) => s + d.due, 0));

  readonly branches = computed(() => [...new Set(this.rates().map(r => r.branch))]);
  readonly courses = computed(() => {
    const seen = new Map<number, { courseId: number; courseName?: string }>();
    for (const r of this.rates()) if (!seen.has(r.courseId)) seen.set(r.courseId, { courseId: r.courseId, courseName: r.courseName });
    return [...seen.values()];
  });

  dialogVisible = false;
  readonly dialogStudentId = signal<number | null>(null);

  constructor() {
    this.loadRates();
    this.loadDues();
  }

  cell(courseId: number, branch: string): ExamFeeRate | undefined {
    return this.rates().find(r => r.courseId === courseId && r.branch === branch);
  }

  money(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  save(): void {
    this.saving.set(true);
    this.api.saveRates(this.rates()).subscribe({
      next: r => {
        this.saving.set(false);
        this.rates.set(r.data);
        this.messages.add({ severity: 'success', summary: 'Exam fees saved', life: 3000 });
        this.loadDues();
      },
      error: () => this.saving.set(false)
    });
  }

  open(row: ExamFeeDueRow): void {
    this.dialogStudentId.set(row.studentId);
    this.dialogVisible = true;
  }

  loadDues(): void {
    this.loadingDues.set(true);
    this.api.dues().subscribe({
      next: d => { this.dues.set(d); this.loadingDues.set(false); },
      error: () => this.loadingDues.set(false)
    });
  }

  private loadRates(): void {
    this.api.rates().subscribe({
      next: r => { this.rates.set(r); this.loadingRates.set(false); },
      error: () => this.loadingRates.set(false)
    });
  }
}
