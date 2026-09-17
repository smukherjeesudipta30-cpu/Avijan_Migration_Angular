import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';

import { AdmissionDue } from '../../core/models/student.model';
import { StudentService } from '../../core/services/student.service';

/**
 * Takes an instalment against a student's unpaid admission fee.
 *
 * Its own component because the same job is done from two screens — the student's
 * own row, and the fees counter where the rest of the money is taken — and a
 * second copy of this dialog is a second place for the two to drift apart.
 */
@Component({
  selector: 'app-admission-due-dialog',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    TagModule
  ],
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      [style]="{ width: '32rem' }"
      header="Collect admission fee">

      @if (loading()) {
        <p class="app-muted">Loading…</p>
      } @else if (due()) {
        @if (due()!; as d) {
        <div class="adm__who">
          <strong>{{ d.studentName || '—' }}</strong>
          @if (d.registrationId) {
            <code class="adm__code">{{ d.registrationId }}</code>
          }
        </div>

        <div class="adm__tiles">
          <div class="adm__tile">
            <span>Admission fee</span>
            <strong>{{ d.admissionFees | currency: 'INR' : 'symbol-narrow' : '1.2-2' }}</strong>
          </div>
          <div class="adm__tile">
            <span>Received</span>
            <strong>{{ d.admissionFeesPaid | currency: 'INR' : 'symbol-narrow' : '1.2-2' }}</strong>
          </div>
          <div class="adm__tile adm__tile--due">
            <span>Still owing</span>
            <strong>{{ d.admissionDue | currency: 'INR' : 'symbol-narrow' : '1.2-2' }}</strong>
          </div>
        </div>

        @if (d.admissionDue <= 0) {
          <p-message severity="success" text="This admission fee is fully paid." styleClass="adm__msg" />
        } @else {
          @if (error(); as message) {
            <p-message severity="error" [text]="message" styleClass="adm__msg" />
          }

          <div class="adm__field">
            <label for="admAmount">Amount <span class="adm__req">*</span></label>
            <p-inputNumber
              inputId="admAmount"
              [(ngModel)]="amount"
              mode="currency"
              currency="INR"
              locale="en-IN"
              [min]="0"
              [max]="d.admissionDue"
              [maxFractionDigits]="2" />
            <small class="app-muted">
              Cannot be more than the {{ d.admissionDue | currency: 'INR' : 'symbol-narrow' : '1.2-2' }} owing.
            </small>
          </div>

          <div class="adm__field">
            <label>Payment mode <span class="adm__req">*</span></label>
            <div class="adm__mode">
              <label class="adm__mode-option">
                <input type="radio" name="admMode" value="Cash" [(ngModel)]="mode" /> Cash
              </label>
              <label class="adm__mode-option">
                <input type="radio" name="admMode" value="Bank" [(ngModel)]="mode" /> Bank
              </label>
            </div>
          </div>

          <div class="adm__field">
            <label for="admPaidOn">Received on</label>
            <p-datePicker
              inputId="admPaidOn"
              [(ngModel)]="paidOn"
              dateFormat="dd/mm/yy"
              [showIcon]="true"
              appendTo="body" />
          </div>

          <div class="adm__field">
            <label for="admNote">Note</label>
            <input pInputText id="admNote" [(ngModel)]="note" maxlength="250" />
          </div>
        }

        @if (d.receipts.length) {
          <div class="adm__receipts">
            <h3>Received so far</h3>
            <ul>
              @for (r of d.receipts; track r.id) {
                <li>
                  <span>{{ r.paidOn | date: 'd MMM y' }}</span>
                  <strong>{{ r.amount | currency: 'INR' : 'symbol-narrow' : '1.2-2' }}</strong>
                  <p-tag [value]="r.paymentMode || '—'" severity="secondary" />
                  @if (r.isAtAdmission) {
                    <small class="app-muted">at admission</small>
                  }
                </li>
              }
            </ul>
          </div>
        }
        }
      } @else {
        <p class="app-muted">Nothing to show.</p>
      }

      <ng-template pTemplate="footer">
        <p-button label="Close" severity="secondary" [text]="true" (onClick)="visible.set(false)" />
        @if ((due()?.admissionDue ?? 0) > 0) {
          <p-button
            label="Record payment"
            icon="pi pi-check"
            [loading]="saving()"
            (onClick)="submit()" />
        }
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .adm__who { display: flex; align-items: center; gap: .6rem; margin-bottom: 1rem; }
    .adm__code { font-family: monospace; font-size: .8rem; }

    .adm__tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: .6rem; margin-bottom: 1.1rem; }
    .adm__tile {
      padding: .6rem .7rem;
      border: 1px solid var(--app-border);
      border-radius: 8px;
      display: grid;
      gap: .15rem;

      span { font-size: .72rem; color: var(--app-text-muted, #6b7280); }
      strong { font-size: 1rem; }
    }
    .adm__tile--due strong { color: var(--app-negative); }

    .adm__field { margin-bottom: 1rem; }
    .adm__field label { display: block; font-size: .82rem; font-weight: 600; margin-bottom: .35rem; }
    .adm__req { color: var(--app-negative); }
    :host ::ng-deep .adm__field .p-inputnumber,
    :host ::ng-deep .adm__field input { width: 100%; }

    .adm__mode { display: flex; gap: 1.2rem; }
    .adm__mode-option { display: flex; align-items: center; gap: .4rem; font-weight: 400; }

    :host ::ng-deep .adm__msg { display: block; margin-bottom: 1rem; }

    .adm__receipts { margin-top: 1.2rem; padding-top: .9rem; border-top: 1px solid var(--app-border); }
    .adm__receipts h3 { font-size: .85rem; margin: 0 0 .5rem; }
    .adm__receipts ul { list-style: none; margin: 0; padding: 0; display: grid; gap: .4rem; }
    .adm__receipts li { display: flex; align-items: center; gap: .6rem; font-size: .82rem; }
  `]
})
export class AdmissionDueDialogComponent {
  private readonly students = inject(StudentService);
  private readonly messages = inject(MessageService);

  /** Which student's admission fee. Null closes the dialog down to nothing. */
  readonly studentId = input<number | null>(null);

  readonly visible = model(false);

  /** Fired after a successful collection, carrying the refreshed figures. */
  readonly collected = output<AdmissionDue>();

  readonly due = signal<AdmissionDue | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  amount: number | null = null;
  mode: 'Cash' | 'Bank' = 'Cash';
  paidOn: Date | null = new Date();
  note = '';

  constructor() {
    /* Loaded on open rather than on input, so the figures are the current ones
       every time it is opened — the balance may have moved on another screen. */
    effect(() => {
      const id = this.studentId();

      if (!this.visible() || id === null) return;

      this.load(id);
    });
  }

  private load(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.due.set(null);

    this.students.admissionDue(id).subscribe({
      next: data => {
        this.loading.set(false);
        this.due.set(data);

        // Pre-filled with the whole balance: settling it in full is the common case.
        this.amount = data.admissionDue > 0 ? data.admissionDue : null;
        this.mode = 'Cash';
        this.paidOn = new Date();
        this.note = '';
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Could not load the admission fee for this student.');
      }
    });
  }

  submit(): void {
    const id = this.studentId();
    const current = this.due();

    if (id === null || current === null) return;

    if (!this.amount || this.amount <= 0) {
      this.error.set('Enter an amount greater than zero.');
      return;
    }

    if (this.amount > current.admissionDue) {
      this.error.set('That is more than the amount still owing.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    this.students
      .collectAdmissionDue(id, {
        amount: this.amount,
        paymentMode: this.mode,
        paidOn: this.toIsoDate(this.paidOn),
        note: this.note.trim() || null
      })
      .subscribe({
        next: response => {
          this.saving.set(false);

          if (response.success === false) {
            this.error.set(response.message ?? 'That payment could not be recorded.');
            return;
          }

          this.due.set(response.data);
          this.amount = null;

          this.messages.add({
            severity: 'success',
            summary: 'Recorded',
            detail: response.message ?? 'Admission fee instalment recorded.'
          });

          this.collected.emit(response.data);

          // Closed once nothing is left owing; kept open on a part payment so the
          // counter can see the new balance it just created.
          if (response.data.admissionDue <= 0) {
            this.visible.set(false);
          }
        },
        error: (err: { error?: { message?: string } }) => {
          this.saving.set(false);
          this.error.set(err?.error?.message ?? 'That payment could not be recorded.');
        }
      });
  }

  private toIsoDate(value: Date | null): string | null {
    if (!value) return null;

    const pad = (n: number) => String(n).padStart(2, '0');

    // Built from local parts, not toISOString(), which shifts to UTC and can hand
    // back the previous day for anything east of Greenwich.
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
}
