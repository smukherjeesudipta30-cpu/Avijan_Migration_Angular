import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, debounceTime } from 'rxjs';

import { ApiResponse } from '../../core/models/api-response.model';
import {
  FeeCalculation,
  FeePayment,
  FeeReceipt,
  FeeRecorded,
  FeeSaveRequest,
  StudentFeeBill
} from '../../core/models/fee.model';
import { canWhatsApp, feeReceiptMessage, openWhatsApp } from '../../core/messaging/whatsapp';
import {
  moneyReceiptHtml,
  openPendingDocumentWindow,
  writeDocumentWindow
} from '../../core/printing/legacy-documents';
import { AuthService } from '../../core/services/auth.service';
import { FeeService } from '../../core/services/fee.service';
import { AdmissionDueDialogComponent } from '../../shared/admission-due/admission-due-dialog.component';

/**
 * Monthly course fees — the migration of `Views/MonthlyCourseFees/Index.cshtml` and
 * `Scripts/MonthlyCourse.js`.
 *
 * The one structural change: the late fine, total and new due are worked out by the
 * server rather than in the browser. The legacy page calculated them in JavaScript
 * and then posted the results, so a stale or edited field could be saved. Here the
 * figures are read-only and refresh from `/fees/calculate` whenever an input changes.
 */
@Component({
  selector: 'app-fees',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TagModule,
    TooltipModule,
    AdmissionDueDialogComponent
  ],
  providers: [ConfirmationService],
  templateUrl: './fees.component.html',
  styleUrl: './fees.component.scss'
})
export class FeesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly fees = inject(FeeService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);

  /** Whoever can enter or correct a fee payment can also delete a mistaken one — Receptionist or Admin. */
  readonly canDeletePayment = computed(() => this.auth.hasAnyRole(['Admin', 'Receptionist']));

  readonly registrationId = signal('');
  readonly bill = signal<StudentFeeBill | null>(null);
  readonly loadingBill = signal(false);
  readonly notFound = signal<string | null>(null);

  readonly payments = signal<FeePayment[]>([]);
  readonly paymentsTotal = signal(0);
  readonly loadingPayments = signal(false);

  readonly calculation = signal<FeeCalculation | null>(null);
  readonly calculating = signal(false);
  readonly saving = signal(false);

  /** Set when amending an existing ledger row. */
  readonly editingPaymentId = signal<number | null>(null);
  readonly editingBillNo = signal<string | null>(null);
  readonly isEditing = computed(() => this.editingPaymentId() !== null);

  readonly hasStudent = computed(() => this.bill() !== null);

  readonly form = this.fb.nonNullable.group({
    feeDate: [new Date() as Date | null, [Validators.required]],
    installmentAmount: [null as number | null, [Validators.required, Validators.min(0)]],
    teacherPercentage: [null as number | null, [Validators.required, Validators.min(0), Validators.max(100)]],
    amountPaid: [null as number | null, [Validators.required, Validators.min(0)]],
    paymentMode: ['Cash' as 'Cash' | 'Bank', [Validators.required]]
  });

  constructor() {
    // Any change to the three inputs re-asks the server for the fine and totals.
    this.form.valueChanges.pipe(debounceTime(350)).subscribe(() => this.recalculate());
  }

  /* -------------------------------------------------------------- lookup */
  /* ------------------------------------------ collecting an admission due */
  readonly admissionDueStudentId = signal<number | null>(null);
  admissionDueVisible = false;

  openAdmissionDue(studentId: number): void {
    this.admissionDueStudentId.set(studentId);
    this.admissionDueVisible = true;
  }

  /** The balance moved, so the bill on screen has to be read again. */
  onAdmissionDueCollected(): void {
    this.loadStudent();
  }

  loadStudent(): void {
    const reg = this.registrationId().trim();
    if (!reg) return;

    this.loadingBill.set(true);
    this.notFound.set(null);
    this.resetForm();

    this.fees.bill(reg).subscribe({
      next: data => {
        this.bill.set(data);
        this.loadingBill.set(false);

        // Default the installment to the student's agreed monthly fee.
        this.form.controls.installmentAmount.setValue(data.monthlyFees ?? null);
        this.loadPayments();
        this.recalculate();
      },
      error: (error: unknown) => {
        this.loadingBill.set(false);
        this.bill.set(null);
        this.payments.set([]);

        if (error instanceof HttpErrorResponse && error.status === 404) {
          const body = error.error as ApiResponse<unknown> | null;
          this.notFound.set(body?.message ?? `No active student found for '${reg}'.`);
        }
      }
    });
  }

  loadPayments(): void {
    const reg = this.bill()?.registrationId;
    if (!reg) return;

    this.loadingPayments.set(true);

    this.fees.payments(reg, 1, 50).subscribe({
      next: result => {
        this.payments.set(result.items);
        this.paymentsTotal.set(result.totalCount);
        this.loadingPayments.set(false);
      },
      error: () => this.loadingPayments.set(false)
    });
  }

  /* --------------------------------------------------------- calculation */
  private recalculate(): void {
    const student = this.bill();
    const v = this.form.getRawValue();

    if (!student || !v.feeDate || v.installmentAmount === null) {
      this.calculation.set(null);
      return;
    }

    this.calculating.set(true);

    this.fees
      .calculate({
        registrationId: student.registrationId,
        feeDate: this.toIsoDate(v.feeDate)!,
        installmentAmount: v.installmentAmount,
        amountPaid: v.amountPaid
      })
      .subscribe({
        next: result => {
          this.calculation.set(result);
          this.calculating.set(false);
        },
        error: () => {
          this.calculation.set(null);
          this.calculating.set(false);
        }
      });
  }

  /* ------------------------------------------------------------- persist */
  submit(): void {
    const student = this.bill();
    const calc = this.calculation();

    if (!student || !calc) {
      this.messages.add({
        severity: 'warn',
        summary: 'Nothing to save',
        detail: 'Load a student and fill in the amounts first.',
        life: 5000
      });
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Date, installment, teacher percentage and amount paid are all required.',
        life: 5000
      });
      return;
    }

    const v = this.form.getRawValue();
    const id = this.editingPaymentId();

    /* Adding a payment for a month that already has one is how the same month ends
       up with two bills — e.g. a receptionist meaning to fix Cash to Bank, but
       typing the correction into "Record payment" instead of clicking the pencil on
       the existing row. That leaves both the original and the correction on the
       ledger, doubling the amount. Confirmed here rather than blocked outright,
       because a genuine second installment in one month is real (a part payment
       followed by the rest) — only the accidental case needs a pause. */
    if (id === null) {
      const duplicate = this.paymentInSameMonth(v.feeDate);

      if (duplicate) {
        this.confirm.confirm({
          header: 'Payment already recorded for this month',
          message:
            `${duplicate.billNo ?? 'A payment'} already covers ` +
            `${v.feeDate ? this.monthLabel(v.feeDate) : 'this month'} ` +
            `(${this.money(duplicate.installment)}, ${duplicate.paymentMode ?? 'mode not recorded'}). ` +
            'To correct that payment — including changing cash to bank — click the ' +
            'pencil on its row instead of Record here. Only continue if this is a ' +
            'genuine second payment for the same month.',
          acceptLabel: 'Record as a second payment',
          rejectLabel: 'Cancel',
          accept: () => this.persist(student, calc, v),
          reject: () => {}
        });
        return;
      }
    }

    this.persist(student, calc, v);
  }

  private paymentInSameMonth(feeDate: Date | null): FeePayment | null {
    if (!feeDate) return null;

    return this.payments().find(p => {
      if (!p.feeDate) return false;
      const d = new Date(p.feeDate);
      return d.getFullYear() === feeDate.getFullYear() && d.getMonth() === feeDate.getMonth();
    }) ?? null;
  }

  private monthLabel(date: Date): string {
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  private persist(
    student: StudentFeeBill,
    calc: FeeCalculation,
    v: ReturnType<typeof this.form.getRawValue>
  ): void {
    this.saving.set(true);

    const payload: FeeSaveRequest = {
      registrationId: student.registrationId,
      feeDate: this.toIsoDate(v.feeDate)!,
      previousPaymentDate: student.lastPaymentDate ?? null,
      installmentAmount: v.installmentAmount!,
      teacherPercentage: v.teacherPercentage!,
      lateFine: calc.lateFine,
      totalForMonth: calc.totalForMonth,
      amountPaid: v.amountPaid!,
      oldDue: calc.oldDue,
      newDue: calc.newDue,
      paymentMode: v.paymentMode
    };

    const id = this.editingPaymentId();

    const request$: Observable<ApiResponse<FeeRecorded | boolean>> = id === null
      ? this.fees.record(payload)
      : this.fees.update(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);

        const recorded = id === null ? (response.data as FeeRecorded) : null;

        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Payment saved' : 'Payment updated',
          detail: recorded
            ? `Bill ${recorded.billNo} · ${this.money(recorded.teacherSalaryEach)} to each teacher.`
            : response.message ?? 'Saved.',
          life: 7000
        });

        this.resetForm();
        this.loadStudent();
      },
      error: (error: unknown) => {
        this.saving.set(false);

        if (error instanceof HttpErrorResponse) {
          const body = error.error as ApiResponse<unknown> | null;
          if (body?.errors?.length) {
            this.messages.add({
              severity: 'error',
              summary: 'Could not save',
              detail: body.errors.join(' '),
              life: 8000
            });
          }
        }
      }
    });
  }

  edit(payment: FeePayment): void {
    this.editingPaymentId.set(payment.id);
    this.editingBillNo.set(payment.billNo ?? null);

    // The stored Installment is the total including the fine, so back the fine out
    // to recover the bare installment the form works with.
    const installment = (payment.installment ?? 0) - (payment.lateFine ?? 0);

    this.form.patchValue({
      feeDate: payment.feeDate ? new Date(payment.feeDate) : new Date(),
      installmentAmount: installment,
      teacherPercentage: payment.percentage ?? null,
      amountPaid: payment.amountPaid ?? null,
      paymentMode: payment.paymentMode ?? 'Cash'
    });

    document.getElementById('fee-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Removes a payment entered by mistake or duplicated — see {@link canDeletePayment}. */
  removePayment(payment: FeePayment): void {
    this.confirm.confirm({
      header: 'Remove payment',
      message:
        `Remove the ${payment.billNo ?? 'unbilled'} payment of ` +
        `${payment.installment ?? 0} recorded on ` +
        `${payment.feeDate ? new Date(payment.feeDate).toLocaleDateString('en-IN') : 'an unknown date'}? ` +
        "This cannot be undone, and the student's due recalculates from what remains.",
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.fees.delete(payment.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Payment removed', life: 4000 });
            if (this.editingPaymentId() === payment.id) this.resetForm();
            this.loadPayments();
          }
        });
      }
    });
  }

  resetForm(): void {
    this.form.reset({
      feeDate: new Date(),
      installmentAmount: this.bill()?.monthlyFees ?? null,
      teacherPercentage: null,
      amountPaid: null,
      paymentMode: 'Cash'
    });

    this.editingPaymentId.set(null);
    this.editingBillNo.set(null);
    this.calculation.set(null);
  }

  clearStudent(): void {
    this.registrationId.set('');
    this.bill.set(null);
    this.payments.set([]);
    this.notFound.set(null);
    this.resetForm();
  }

  printReceipt(payment: FeePayment): void {
    const win = openPendingDocumentWindow(760);

    this.fees.receipt(payment.id).subscribe({
      next: receipt => this.openReceiptWindow(receipt, win),
      error: () => win?.close()
    });
  }

  /* ------------------------------------------------------------ whatsapp */

  /** The number the receipt would go to — from the bill already on screen. */
  studentPhone(): string | null {
    return this.bill()?.phone ?? null;
  }

  /** Greys out the button when the stored number cannot be a WhatsApp one. */
  canWhatsApp(phone?: string | null): boolean {
    return canWhatsApp(phone);
  }

  /**
   * Opens WhatsApp with the money receipt typed out to the student.
   *
   * The receipt is fetched rather than built from the row on screen, so the figures
   * the student is sent are the same ones the printed receipt shows — including the
   * amount in words and the next due date, which only the server works out.
   */
  whatsAppReceipt(payment: FeePayment): void {
    this.fees.receipt(payment.id).subscribe({
      next: receipt => {
        if (!openWhatsApp(this.studentPhone(), feeReceiptMessage(receipt))) {
          this.messages.add({
            severity: 'warn',
            summary: 'Could not open WhatsApp',
            detail: 'Allow popups for this site, and check the mobile number on the student record.',
            life: 6000
          });
        }
      }
    });
  }

  money(value?: number | null): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(value ?? 0);
  }

  /* ----------------------------------------------------------- helpers */
  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }

  /** The money receipt, in the legacy layout. */
  private openReceiptWindow(receipt: FeeReceipt, win: Window | null = null): void {
    if (!writeDocumentWindow(win, moneyReceiptHtml(receipt))) {
      this.messages.add({
        severity: 'warn',
        summary: 'Popup blocked',
        detail: 'Allow popups for this site to print the receipt.',
        life: 6000
      });
    }
  }
}
