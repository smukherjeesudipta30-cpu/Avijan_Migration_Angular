import { CommonModule } from '@angular/common';
import { StaffAvatarComponent } from '../../shared/staff-avatar.component';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { RouterLink } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { formatMoney } from '../../core/format/money';
import { ApiResponse } from '../../core/models/api-response.model';
import { BranchListItem } from '../../core/models/master.model';
import {
  ExtraShiftBonus,
  ReceptionistListItem,
  ReceptionistPayment,
  ReceptionistSaveRequest
} from '../../core/models/receptionist.model';
import {
  honorariumPayslipHtml,
  openPendingDocumentWindow,
  writeDocumentWindow
} from '../../core/printing/legacy-documents';
import { AuthService } from '../../core/services/auth.service';
import { MasterService } from '../../core/services/master.service';
import { ReceptionistService } from '../../core/services/receptionist.service';
import { ReportService } from '../../core/services/report.service';
import { PayCycleNoticeComponent } from '../../shared/pay-cycle/pay-cycle-notice.component';

/**
 * Receptionist master and their monthly pay.
 *
 * Modelled on the teacher master so the two read alike, with two differences that
 * follow from how a receptionist is actually paid: a **monthly** amount rather
 * than a share of each fee, so a payment names the month it covers and there is
 * one per month; and a **branch**, which is what makes the report branch-wise.
 */
@Component({
  selector: 'app-receptionists',
  imports: [
    StaffAvatarComponent,
    CommonModule,
    PayCycleNoticeComponent,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    RouterLink,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './receptionists.component.html',
  styleUrl: './receptionists.component.scss'
})
export class ReceptionistsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ReceptionistService);
  private readonly reports = inject(ReportService);
  private readonly masters = inject(MasterService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);

  readonly rows = signal<ReceptionistListItem[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly branches = signal<BranchListItem[]>([]);

  /** Only an administrator may pay someone, or remove a record. */
  readonly canPay = computed(() => this.auth.hasAnyRole(['Admin']));

  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  readonly search = signal('');
  readonly branchFilter = signal<string | null>(null);
  readonly activeOnly = signal(true);
  readonly page = signal(1);
  readonly pageSize = signal(25);

  readonly today = new Date();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    loginId: ['', [Validators.email]],
    phone: ['', [Validators.pattern(/^[0-9]{10}$/)]],
    personalEmail: ['', [Validators.email, Validators.maxLength(150)]],
    designation: ['', [Validators.maxLength(150)]],
    // Required: a receptionist with no branch would never appear in the report
    // the master exists to feed.
    branch: [null as string | null, [Validators.required]],
    isActive: [true]
  });

  /* Qualification, computer training and IsTechnical are set from Staff Hierarchy
     (org-manage.component), not from this form, but are still columns on the same
     Receptionist row -- carried through unedited on save rather than dropped, so
     editing a receptionist's branch here does not wipe them out. */
  private currentQualification: string | null = null;
  private currentComputerTraining: string | null = null;
  private currentIsTechnical = false;

  constructor() {
    this.load();

    this.masters.branches().subscribe({
      next: rows => this.branches.set(rows.filter(b => b.isActive))
    });
  }

  /* ---------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    this.service
      .list(
        this.page(),
        this.pageSize(),
        this.search().trim() || null,
        this.branchFilter(),
        this.activeOnly()
      )
      .subscribe({
        next: result => {
          this.rows.set(result.items);
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.pageSize();
    const first = event.first ?? 0;

    this.pageSize.set(size);
    this.page.set(Math.floor(first / size) + 1);
    this.load();
  }

  applyFilter(): void {
    this.page.set(1);
    this.load();
  }

  /* ---------------------------------------------------------------- form */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Name and branch are both required.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);

    const v = this.form.getRawValue();

    const payload: ReceptionistSaveRequest = {
      name: v.name.trim(),
      loginId: v.loginId?.trim() || null,
      phone: v.phone?.trim() || null,
      personalEmail: v.personalEmail?.trim() || null,
      designation: v.designation?.trim() || null,
      qualification: this.currentQualification,
      computerTraining: this.currentComputerTraining,
      isTechnical: this.currentIsTechnical,
      branch: v.branch,
      isActive: v.isActive
    };

    const id = this.editingId();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.service.create(payload)
      : this.service.update(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Receptionist added' : 'Receptionist updated',
          detail: response.message ?? 'Saved.',
          life: 5000
        });
        this.resetForm();
        this.load();
      },
      error: () => this.saving.set(false)
    });
  }

  edit(person: ReceptionistListItem): void {
    this.editingId.set(person.id);

    this.form.reset({
      name: person.name,
      loginId: person.loginId ?? '',
      phone: person.phone ?? '',
      personalEmail: person.personalEmail ?? '',
      designation: person.designation ?? '',
      branch: person.branch ?? null,
      isActive: person.isActive
    });

    this.currentQualification = person.qualification ?? null;
    this.currentComputerTraining = person.computerTraining ?? null;
    this.currentIsTechnical = person.isTechnical ?? false;

    document.getElementById('rec-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    this.form.reset({
      name: '', loginId: '', phone: '', personalEmail: '', branch: null, isActive: true,
      designation: ''
    });
    this.currentQualification = null;
    this.currentComputerTraining = null;
    this.currentIsTechnical = false;
    this.editingId.set(null);
  }

  remove(person: ReceptionistListItem): void {
    this.confirm.confirm({
      header: 'Delete receptionist',
      message: person.paymentCount > 0
        ? `${person.name} has ${person.paymentCount} payment(s) recorded, so the record ` +
          'cannot be deleted. Mark them inactive instead.'
        : `Delete ${person.name}? This cannot be undone.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: person.paymentCount > 0 ? 'I understand' : 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: person.paymentCount > 0 ? 'p-button-secondary' : 'p-button-danger',
      accept: () => {
        if (person.paymentCount > 0) return;

        this.service.delete(person.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Deleted', life: 4000 });
            if (this.editingId() === person.id) this.resetForm();
            this.load();
          }
        });
      }
    });
  }

  /**
   * The fees master field: the receptionist's own row is the editable input
   * (bound in the template), so all this holds is which row is mid-save, to
   * disable that row's input and show the spinner while the request is out.
   */
  readonly savingMonthlyPayId = signal<number | null>(null);

  saveMonthlyPay(person: ReceptionistListItem): void {
    const value = person.monthlyPay ?? 0;
    if (value < 0) return;

    this.savingMonthlyPayId.set(person.id);

    this.service.updateMonthlyPay(person.id, value).subscribe({
      next: () => {
        this.savingMonthlyPayId.set(null);
        this.messages.add({
          severity: 'success',
          summary: 'Monthly pay updated',
          detail: `${this.money(value)} for ${person.name}.`,
          life: 3000
        });
      },
      error: () => {
        this.savingMonthlyPayId.set(null);
        this.messages.add({
          severity: 'error',
          summary: 'Could not save',
          detail: 'The monthly pay was not updated. Try again.',
          life: 5000
        });
      }
    });
  }

  /* ------------------------------------------------------------ payments */
  readonly payVisible = signal(false);
  readonly payFor = signal<ReceptionistListItem | null>(null);
  readonly payments = signal<ReceptionistPayment[]>([]);
  readonly paymentsLoading = signal(false);
  readonly savingPayment = signal(false);

  readonly payMonth = signal<Date | null>(new Date());
  readonly payAmount = signal<number | null>(null);
  readonly payNotes = signal('');

  /**
   * A read-only preview of the net extra-shift transfer the server will apply
   * automatically when this payment is saved — never entered, never edited
   * here. See {@link ReceptionistService.extraShiftBonus}.
   */
  readonly bonusSuggestion = signal<ExtraShiftBonus | null>(null);
  readonly bonusLoading = signal(false);
  /** Admission referral credits this payment will pay; null until loaded. */
  readonly referralBonus = signal<number | null>(null);

  /**
   * The day the money actually changed hands, as distinct from `payMonth`, which is
   * the month the salary covers. They differ whenever a month is settled late —
   * which is precisely when someone needs to record the real date rather than
   * today's, and until now the form sent today's regardless.
   */
  readonly payDate = signal<Date | null>(new Date());

  readonly paymentsTotal = computed(() =>
    this.payments().reduce((sum, p) => sum + (p.amount ?? 0) + (p.extraShiftBonus ?? 0), 0));

  openPayments(person: ReceptionistListItem): void {
    this.payFor.set(person);
    this.payVisible.set(true);
    this.payments.set([]);
    this.payMonth.set(new Date());
    this.payDate.set(new Date());
    // The fees master figure is the default; loadPayments() below falls back
    // to last month's actual amount only when no master figure is set yet.
    this.payAmount.set(person.monthlyPay > 0 ? person.monthlyPay : null);
    this.bonusSuggestion.set(null);
    this.payNotes.set('');
    this.loadPayments();
    if (this.auth.hasAnyRole(['Admin'])) this.loadBonusSuggestion();
  }

  /** Which colleague was covered, or covered for this person, and when — for the tooltip only. */
  bonusTooltip(bonus: ExtraShiftBonus): string {
    const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const parts: string[] = [];

    if (bonus.coveredForOthers.length) {
      parts.push('Covered for: ' + bonus.coveredForOthers
        .map(d => `${d.otherReceptionistName} on ${fmt(d.date)} (${d.hours}h, ${this.money(d.amount)})`).join(', '));
    }
    if (bonus.coveredByOthers.length) {
      parts.push('Covered by: ' + bonus.coveredByOthers
        .map(d => `${d.otherReceptionistName} on ${fmt(d.date)} (${d.hours}h, ${this.money(d.amount)})`).join(', '));
    }

    return parts.join(' · ');
  }

  /**
   * A preview only — the server computes this figure again, from scratch, the
   * moment the payment is actually saved, so nothing typed or clicked here can
   * change what gets applied.
   */
  loadBonusSuggestion(): void {
    const person = this.payFor();
    const month = this.payMonth();
    if (!person || !month) return;

    this.bonusLoading.set(true);
    this.referralBonus.set(null);

    this.service.referralBonus(person.id, this.toIsoDate(month)!).subscribe({
      next: amount => this.referralBonus.set(amount),
      error: () => this.referralBonus.set(null)
    });

    this.service.extraShiftBonus(person.id, this.toIsoDate(month)!).subscribe({
      next: (bonus: ExtraShiftBonus) => {
        this.bonusSuggestion.set(bonus);
        this.bonusLoading.set(false);
      },
      error: () => this.bonusLoading.set(false)
    });
  }

  loadPayments(): void {
    const person = this.payFor();
    if (!person) return;

    this.paymentsLoading.set(true);

    this.service.payments(person.id).subscribe({
      next: rows => {
        this.payments.set(rows);
        this.paymentsLoading.set(false);

        // Default to last month's own pay — the "payment structure" only
        // changes when the Admin deliberately types a different figure here;
        // left alone, the same amount simply carries forward.
        if (this.payAmount() === null && rows.length > 0) {
          this.payAmount.set(rows[0].amount);
        }
      },
      error: () => this.paymentsLoading.set(false)
    });
  }

  recordPayment(): void {
    const person = this.payFor();
    const month = this.payMonth();
    const amount = this.payAmount();

    if (!person || !month || !amount || amount <= 0) {
      this.messages.add({
        severity: 'warn',
        summary: 'Month and amount required',
        detail: 'Choose the month being paid for and enter an amount.',
        life: 4000
      });
      return;
    }

    this.savingPayment.set(true);

    this.service
      .recordPayment({
        receptionistId: person.id,
        payMonth: this.toIsoDate(month)!,
        paidOn: this.toIsoDate(this.payDate()),
        amount,
        notes: this.payNotes().trim() || null
      })
      .subscribe({
        next: () => {
          this.savingPayment.set(false);
          this.payAmount.set(null);
          this.bonusSuggestion.set(null);
          this.payNotes.set('');

          this.messages.add({
            severity: 'success',
            summary: 'Payment recorded',
            detail:
              `${this.money(amount)} to ${person.name} for ` +
              `${month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}.`,
            life: 6000
          });

          this.loadPayments();
          this.load();
        },
        error: () => this.savingPayment.set(false)
      });
  }

  readonly downloadingPayslipId = signal<number | null>(null);

  /** Opens the printable pay slip for one already-recorded month. */
  downloadPayslip(payment: ReceptionistPayment): void {
    const person = this.payFor();
    if (!person) return;

    this.downloadingPayslipId.set(payment.id);

    const win = openPendingDocumentWindow();

    this.reports.receptionistPayslip(person.id, payment.payMonth).subscribe({
      next: slip => {
        this.downloadingPayslipId.set(null);

        if (!writeDocumentWindow(win, honorariumPayslipHtml(slip))) {
          this.messages.add({
            severity: 'warn',
            summary: 'Pop-up blocked',
            detail: 'Allow pop-ups for this site to open the pay slip.',
            life: 6000
          });
        }
      },
      // errorInterceptor already raises the toast carrying the server's message.
      error: () => {
        this.downloadingPayslipId.set(null);
        win?.close();
      }
    });
  }

  removePayment(payment: ReceptionistPayment): void {
    this.confirm.confirm({
      header: 'Remove payment',
      message:
        `Remove the ${this.money(payment.amount)} paid for ` +
        `${new Date(payment.payMonth).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.service.deletePayment(payment.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Payment removed', life: 4000 });
            this.loadPayments();
            this.load();
          }
        });
      }
    });
  }

  money(value?: number | null): string {
    return formatMoney(value);
  }

  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }
}
