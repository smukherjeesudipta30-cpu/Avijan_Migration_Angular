import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, debounceTime, distinctUntilChanged } from 'rxjs';

import { formatMoney } from '../../core/format/money';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  TeacherAccount,
  TeacherEarning,
  TeacherListItem,
  TeacherPayment,
  TeacherSaveRequest
} from '../../core/models/master.model';
import { AuthService } from '../../core/services/auth.service';
import { MasterService } from '../../core/services/master.service';

/**
 * Teacher master — the migration of `Views/Teacher/Index.cshtml` and
 * `Scripts/Teacher.js`. Same three fields and the same duplicate-login check, with
 * the student count and lifetime earnings added so a teacher can be judged before
 * anyone tries to remove them.
 */
@Component({
  selector: 'app-teachers',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './teachers.component.html',
  styleUrl: './teachers.component.scss'
})
export class TeachersComponent {
  private readonly fb = inject(FormBuilder);
  private readonly masters = inject(MasterService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);

  readonly rows = signal<TeacherListItem[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);
  readonly editingIsPlaceholder = signal(false);

  readonly search = signal('');
  readonly includePlaceholders = signal(true);
  readonly page = signal(1);
  readonly pageSize = signal(10);

  /** Live result of the duplicate user-id check. */
  readonly loginTaken = signal(false);

  /* ---------------------------------------------------------- earnings */
  readonly earningsVisible = signal(false);
  readonly earningsFor = signal<TeacherListItem | null>(null);
  readonly earnings = signal<TeacherEarning[]>([]);
  readonly earningsTotal = signal(0);
  readonly earningsLoading = signal(false);
  readonly earningsFrom = signal<Date | null>(null);
  readonly earningsTo = signal<Date | null>(null);

  readonly earningsPageTotal = computed(() =>
    this.earnings().reduce((sum, e) => sum + (e.amount ?? 0), 0));

  readonly today = new Date();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
    loginId: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9._-]+$/)]],
    phone: ['', [Validators.pattern(/^[0-9]{10}$/)]]
  });

  constructor() {
    this.load();

    this.form.controls.loginId.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(loginId => {
        if (!loginId || this.form.controls.loginId.invalid) {
          this.loginTaken.set(false);
          return;
        }

        this.masters.teacherLoginExists(loginId, this.editingId()).subscribe({
          next: taken => this.loginTaken.set(taken),
          error: () => this.loginTaken.set(false)
        });
      });
  }

  /* -------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    this.masters
      .teachers(this.page(), this.pageSize(), this.search().trim() || null, this.includePlaceholders())
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

  runSearch(): void {
    this.page.set(1);
    this.load();
  }

  togglePlaceholders(value: boolean): void {
    this.includePlaceholders.set(value);
    this.page.set(1);
    this.load();
  }

  /* -------------------------------------------------------------- form */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Teacher name and user id are required.',
        life: 5000
      });
      return;
    }

    if (this.loginTaken()) {
      this.messages.add({
        severity: 'warn',
        summary: 'User id already taken',
        detail: 'Another teacher is using that user id.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);

    const v = this.form.getRawValue();
    const payload: TeacherSaveRequest = {
      name: v.name.trim(),
      loginId: v.loginId.trim(),
      phone: v.phone?.trim() || null
    };

    const id = this.editingId();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.masters.createTeacher(payload)
      : this.masters.updateTeacher(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Teacher added' : 'Teacher updated',
          detail: response.message ?? 'Saved.',
          life: 5000
        });
        this.resetForm();
        this.load();
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

  edit(teacher: TeacherListItem): void {
    this.editingId.set(teacher.id);
    this.editingIsPlaceholder.set(teacher.isPlaceholder);
    this.loginTaken.set(false);

    this.form.patchValue({
      name: teacher.isPlaceholder ? '' : teacher.name ?? '',
      loginId: teacher.isPlaceholder ? '' : teacher.loginId ?? '',
      phone: teacher.phone ?? ''
    });

    document.getElementById('teacher-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    this.form.reset({ name: '', loginId: '', phone: '' });
    this.editingId.set(null);
    this.editingIsPlaceholder.set(false);
    this.loginTaken.set(false);
  }

  remove(teacher: TeacherListItem): void {
    if (teacher.isReferenced) {
      this.messages.add({
        severity: 'warn',
        summary: 'Cannot delete',
        detail:
          `${teacher.name} is referenced by ${teacher.totalStudents} student(s) and past payouts. ` +
          'Reassign them first.',
        life: 8000
      });
      return;
    }

    this.confirm.confirm({
      header: 'Delete teacher',
      message: `Delete ${teacher.name}? Nothing references this teacher, so it can be removed safely.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.masters.deleteTeacher(teacher.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Deleted', life: 4000 });
            this.load();
          }
        });
      }
    });
  }

  /* ---------------------------------------------------------- earnings */
  openEarnings(teacher: TeacherListItem): void {
    this.earningsFor.set(teacher);
    this.earningsVisible.set(true);
    this.earnings.set([]);
    this.loadEarnings();
    this.loadAccount();
  }

  /* ------------------------------ payments made to the teacher */

  /** Only an administrator may pay a teacher. */
  readonly canPay = computed(() => this.auth.hasAnyRole(['Admin']));

  readonly account = signal<TeacherAccount | null>(null);
  readonly payments = signal<TeacherPayment[]>([]);
  readonly paymentsLoading = signal(false);
  readonly savingPayment = signal(false);

  readonly payAmount = signal<number | null>(null);
  readonly payDate = signal<Date | null>(new Date());

  /**
   * The account figures and the payments list, both over the same dates as the
   * earnings list above them — so the three tiles always describe the period on
   * screen rather than the teacher's lifetime.
   */
  loadAccount(): void {
    const teacher = this.earningsFor();
    if (!teacher) return;

    const from = this.toIsoDate(this.earningsFrom());
    const to = this.toIsoDate(this.earningsTo());

    this.paymentsLoading.set(true);

    this.masters.teacherAccount(teacher.id, from, to).subscribe({
      next: data => this.account.set(data),
      error: () => this.account.set(null)
    });

    this.masters.teacherPayments(teacher.id, from, to).subscribe({
      next: rows => {
        this.payments.set(rows);
        this.paymentsLoading.set(false);
      },
      error: () => this.paymentsLoading.set(false)
    });
  }

  recordPayment(): void {
    const teacher = this.earningsFor();
    const amount = this.payAmount();

    if (!teacher || !amount || amount <= 0) {
      this.messages.add({
        severity: 'warn',
        summary: 'Enter an amount',
        detail: 'How much was handed to the teacher?',
        life: 4000
      });
      return;
    }

    this.savingPayment.set(true);

    this.masters
      .recordTeacherPayment({
        teacherId: teacher.id,
        paidOn: this.toIsoDate(this.payDate()),
        amount
      })
      .subscribe({
        next: () => {
          this.savingPayment.set(false);
          this.payAmount.set(null);
          this.payDate.set(new Date());

          this.messages.add({
            severity: 'success',
            summary: 'Payment recorded',
            detail: `${this.money(amount)} to ${teacher.name}.`,
            life: 5000
          });

          this.loadAccount();
          // The list's "last paid" and lifetime totals move with it.
          this.load();
        },
        error: () => this.savingPayment.set(false)
      });
  }

  removePayment(payment: TeacherPayment): void {
    this.confirm.confirm({
      header: 'Remove payment',
      message:
        `Remove the ${this.money(payment.amount)} payment recorded on ` +
        `${payment.paidOn ? new Date(payment.paidOn).toLocaleDateString('en-IN') : 'an unknown date'}? ` +
        "This raises the teacher's pending balance again.",
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.masters.deleteTeacherPayment(payment.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Payment removed', life: 4000 });
            this.loadAccount();
            this.load();
          }
        });
      }
    });
  }

  loadEarnings(): void {
    const teacher = this.earningsFor();
    if (!teacher) return;

    this.earningsLoading.set(true);

    this.masters
      .teacherEarnings(teacher.id, this.toIsoDate(this.earningsFrom()), this.toIsoDate(this.earningsTo()), 1, 100)
      .subscribe({
        next: result => {
          this.earnings.set(result.items);
          this.earningsTotal.set(result.totalCount);
          this.earningsLoading.set(false);
        },
        error: () => this.earningsLoading.set(false)
      });
  }

  clearEarningsRange(): void {
    this.earningsFrom.set(null);
    this.earningsTo.set(null);
    this.applyEarningsRange();
  }

  /** Apply moves the earnings list and the account tiles together. */
  applyEarningsRange(): void {
    this.loadEarnings();
    this.loadAccount();
  }

  /* ----------------------------------------------------------- helpers */
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
