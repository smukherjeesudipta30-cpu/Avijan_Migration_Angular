import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService, SharedModule } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';

import { StudentExamFee } from '../../core/models/exam-fee.model';
import { AuthService } from '../../core/services/auth.service';
import { ExamFeeService } from '../../core/services/exam-fee.service';

/**
 * A student's exam fee: what they are charged, what has come in, and what is
 * still owed - with collecting it (Admin, Editor, Receptionist), removing a
 * mistaken payment, and Admin's per-student amount. Opened from the Students
 * list and from the Exam Fees screen.
 */
@Component({
  selector: 'app-exam-fee-dialog',
  imports: [
    CommonModule, FormsModule, SharedModule, ButtonModule, ConfirmDialogModule, DatePickerModule,
    DialogModule, InputNumberModule, InputTextModule, SelectButtonModule, TagModule
  ],
  providers: [ConfirmationService],
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      [style]="{ width: '34rem', maxWidth: '96vw' }"
      header="Exam fee">

      @if (loading()) {
        <p class="app-muted">Loading…</p>
      } @else {
      @if (fee(); as f) {
        <div class="ef__who">
          <strong>{{ f.studentName || '—' }}</strong>
          <code>{{ f.registrationId }}</code>
          <div class="app-muted ef__sub">{{ f.courseName }} · {{ f.branch || 'No branch' }}</div>
        </div>

        @if (f.examFee === null || f.examFee === undefined) {
          <p class="ef__warn">
            No exam fee is set for this course at {{ f.branch || 'this branch' }}.
            Admin can set it on the Exam Fees screen.
          </p>
        } @else {
          <div class="ef__tiles">
            <div class="ef__tile">
              <span>Exam fee</span>
              <strong>{{ money(f.examFee) }}</strong>
              @if (f.overrideFee !== null && f.overrideFee !== undefined) {
                <small class="app-muted">own amount (standard {{ money(f.standardFee) }})</small>
              }
            </div>
            <div class="ef__tile"><span>Paid</span><strong>{{ money(f.paid) }}</strong></div>
            <div class="ef__tile" [class.ef__tile--due]="f.due > 0">
              <span>Due</span><strong>{{ money(f.due) }}</strong>
            </div>
          </div>

          @if (f.due > 0) {
            <div class="ef__collect">
              <p-inputNumber [(ngModel)]="amount" [min]="1" [max]="f.due" mode="currency" currency="INR" locale="en-IN"
                             placeholder="Amount" />
              <p-selectButton [options]="modes" [(ngModel)]="mode" />
              <p-datePicker [(ngModel)]="paidOn" dateFormat="d M yy" [maxDate]="today" appendTo="body" placeholder="Today" />
              <input pInputText [(ngModel)]="note" placeholder="Note (optional)" />
              <p-button label="Collect" icon="pi pi-check" [loading]="saving()" (onClick)="collect()" />
            </div>
          } @else {
            <p-tag value="Exam fee paid in full" severity="success" />
          }
        }

        @if (f.payments.length) {
          <h4 class="ef__h">Payments</h4>
          <ul class="ef__list">
            @for (p of f.payments; track p.id) {
              <li>
                <span>{{ p.paidOn | date: 'd MMM y' }}</span>
                <strong>{{ money(p.amount) }}</strong>
                <span class="app-muted">{{ p.paymentMode }}@if (p.recordedBy) { · received by {{ p.recordedBy }} }</span>
                <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="remove(p.id, p.amount)" />
              </li>
            }
          </ul>
        }

        @if (isAdmin()) {
          <h4 class="ef__h">This student's own amount (Admin)</h4>
          <div class="ef__override">
            <p-inputNumber [(ngModel)]="overrideAmount" [min]="0" mode="currency" currency="INR" locale="en-IN"
                           [placeholder]="'Standard: ' + money(f.standardFee)" />
            <p-button label="Set" [text]="true" (onClick)="setOverride(overrideAmount)" />
            @if (f.overrideFee !== null && f.overrideFee !== undefined) {
              <p-button label="Use standard fee" [text]="true" severity="secondary" (onClick)="setOverride(null)" />
            }
          </div>
        }
      }
      }
    </p-dialog>
    <p-confirmDialog key="examFee" />
  `,
  styles: `
    .ef__who { margin-bottom: 0.75rem; display: grid; gap: 0.15rem; }
    .ef__who code { font-size: 0.8rem; }
    .ef__sub { font-size: 0.82rem; }
    .ef__warn { padding: 0.6rem 0.8rem; border-radius: 6px; background: rgba(234, 179, 8, 0.14); }
    .ef__tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 0.9rem; }
    .ef__tile { display: grid; gap: 0.15rem; padding: 0.55rem 0.7rem; border-radius: 6px; background: rgba(127, 127, 127, 0.08); }
    .ef__tile span { font-size: 0.78rem; opacity: 0.75; }
    .ef__tile--due strong { color: #dc2626; }
    .ef__collect { display: grid; gap: 0.5rem; grid-template-columns: 1fr 1fr; align-items: center; }
    .ef__collect > :last-child { grid-column: 1 / -1; }
    .ef__h { margin: 1rem 0 0.4rem; font-size: 0.9rem; }
    .ef__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.3rem; }
    .ef__list li { display: grid; grid-template-columns: 6.5rem 5.5rem 1fr auto; align-items: center; gap: 0.5rem; font-size: 0.88rem; }
    .ef__override { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    :host ::ng-deep .ef__collect .p-inputnumber, :host ::ng-deep .ef__collect .p-datepicker,
    :host ::ng-deep .ef__collect input { width: 100%; }
  `
})
export class ExamFeeDialogComponent {
  private readonly api = inject(ExamFeeService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly visible = model(false);
  readonly studentId = input<number | null>(null);
  /** Emitted after anything changes, so the opening screen can refresh its list. */
  readonly changed = output<StudentExamFee>();

  readonly fee = signal<StudentExamFee | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly isAdmin = computed(() => this.auth.hasAnyRole(['Admin']));

  readonly modes = [{ label: 'Cash', value: 'Cash' }, { label: 'Bank', value: 'Bank' }];
  readonly today = new Date();

  amount: number | null = null;
  mode: 'Cash' | 'Bank' = 'Cash';
  paidOn: Date | null = null;
  note = '';
  overrideAmount: number | null = null;

  constructor() {
    effect(() => {
      const id = this.studentId();
      if (!this.visible() || !id) return;
      this.load(id);
    });
  }

  money(value: number | null | undefined): string {
    return value === null || value === undefined
      ? '—'
      : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  collect(): void {
    const f = this.fee();
    if (!f || !this.amount) return;

    this.saving.set(true);
    this.api.collect(f.studentId, {
      amount: this.amount,
      paymentMode: this.mode,
      paidOn: this.paidOn ? this.iso(this.paidOn) : null,
      note: this.note.trim() || null
    }).subscribe({
      next: r => {
        this.saving.set(false);
        this.apply(r.data);
        this.messages.add({ severity: 'success', summary: 'Exam fee collected', detail: `${this.money(this.amount)} received.`, life: 4000 });
        this.amount = r.data.due > 0 ? r.data.due : null;
        this.note = '';
      },
      error: () => this.saving.set(false)
    });
  }

  remove(paymentId: number, amount: number): void {
    this.confirm.confirm({
      key: 'examFee',
      header: 'Remove this payment?',
      message: `Remove the ${this.money(amount)} exam fee payment? It will show as owed again.`,
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.api.deletePayment(paymentId).subscribe({ next: () => this.load(this.fee()!.studentId, true) })
    });
  }

  setOverride(amount: number | null): void {
    const f = this.fee();
    if (!f) return;

    this.api.setOverride(f.studentId, amount).subscribe({
      next: r => {
        this.apply(r.data);
        this.overrideAmount = null;
        this.messages.add({
          severity: 'success',
          summary: 'Exam fee updated',
          detail: amount === null ? 'Standard fee applies again.' : `This student's exam fee is now ${this.money(amount)}.`,
          life: 4000
        });
      }
    });
  }

  private load(studentId: number, notify = false): void {
    this.loading.set(!notify);
    this.api.student(studentId).subscribe({
      next: f => {
        this.loading.set(false);
        this.amount = f.due > 0 ? f.due : null;
        notify ? this.apply(f) : this.fee.set(f);
      },
      error: () => this.loading.set(false)
    });
  }

  private apply(f: StudentExamFee): void {
    this.fee.set(f);
    this.changed.emit(f);
  }

  private iso(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
}
