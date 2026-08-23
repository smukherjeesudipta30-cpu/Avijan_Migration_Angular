import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, debounceTime, distinctUntilChanged } from 'rxjs';

import { ApiResponse } from '../../core/models/api-response.model';
import { UpcomingBirthday, UserListItem, UserSaveRequest } from '../../core/models/user.model';
import {
  canIssueReleaseLetter,
  isLetterEligible,
  openExperienceLetter,
  openOfferLetter
} from './letters';
import { UserService } from '../../core/services/user.service';

type StatusFilter = 'all' | 'active' | 'inactive';

/**
 * User administration — the migration of `Views/Register/Index.cshtml` and
 * `Scripts/Users.js`. Same fields and flow, with two deliberate changes: the
 * password column is gone (the legacy grid displayed it in clear), and leaving the
 * password blank on an edit keeps the existing one instead of blanking it.
 */
@Component({
  selector: 'app-users',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    PasswordModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class UsersComponent {
  private readonly fb = inject(FormBuilder);
  private readonly users = inject(UserService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly rows = signal<UserListItem[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly roleOptions = signal<string[]>([]);
  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  readonly searchEmail = signal('');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly page = signal(1);
  readonly pageSize = signal(10);

  /** Live result of the email-exists check (legacy `ufnGetEmailChk`). */
  readonly emailTaken = signal(false);

  readonly birthdaysVisible = signal(false);
  readonly birthdays = signal<UpcomingBirthday[]>([]);
  readonly birthdaysLoading = signal(false);

  /* CTC prompt for the offer letter — the legacy version used window.prompt(). */
  readonly ctcVisible = signal(false);

  /* ------------------------------------------------ set a password to share */

  readonly passwordVisible = signal(false);
  readonly passwordSaving = signal(false);
  readonly passwordUser = signal<UserListItem | null>(null);
  readonly sharePassword = signal('');

  /** Mirrors the server rule, so the dialog says no before the round trip. */
  readonly sharePasswordInvalid = computed(() => {
    const value = this.sharePassword();
    return value.length > 0 && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(value);
  });
  readonly ctcFor = signal<UserListItem | null>(null);
  readonly ctcValue = signal<number | null>(null);

  readonly today = new Date();

  readonly statusOptions = [
    { label: 'All', value: 'all' as StatusFilter },
    { label: 'Active', value: 'active' as StatusFilter },
    { label: 'Inactive', value: 'inactive' as StatusFilter }
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(250)]],
    phone: ['', [Validators.pattern(/^[0-9]{10}$/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(50)]],
    roles: ['', [Validators.required]],
    dateOfBirth: [null as Date | null],
    password: ['', [Validators.required, Validators.minLength(8)]],
    isActive: [true]
  });

  constructor() {
    this.users.roles().subscribe({
      next: data => this.roleOptions.set(data),
      error: () => this.roleOptions.set(['Admin', 'Editor', 'Teacher', 'Student', 'Receptionist'])
    });

    this.load();

    effect(() => {
      this.statusFilter();
      this.page();
      this.pageSize();
      this.load();
    });

    // Debounced duplicate-email check while typing.
    this.form.controls.email.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(email => {
        if (!email || this.form.controls.email.invalid) {
          this.emailTaken.set(false);
          return;
        }

        this.users.emailExists(email, this.editingId()).subscribe({
          next: taken => this.emailTaken.set(taken),
          error: () => this.emailTaken.set(false)
        });
      });
  }

  /* -------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    const status = this.statusFilter();

    this.users
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
        isActive: status === 'all' ? null : status === 'active',
        email: this.searchEmail().trim() || null
      })
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
  }

  search(): void {
    this.page.set(1);
    this.load();
  }

  clearSearch(): void {
    this.searchEmail.set('');
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
        detail: 'Some required fields are missing or invalid.',
        life: 5000
      });
      return;
    }

    if (this.emailTaken()) {
      this.messages.add({
        severity: 'warn',
        summary: 'Email already registered',
        detail: 'That address belongs to another account.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);

    const id = this.editingId();
    const payload = this.toRequest();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.users.create(payload)
      : this.users.update(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'User created' : 'User updated',
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

  edit(user: UserListItem): void {
    this.editingId.set(user.id);
    this.emailTaken.set(false);

    this.form.patchValue({
      name: user.name ?? '',
      phone: user.phone ?? '',
      email: user.email ?? '',
      roles: user.roles ?? '',
      dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth) : null,
      password: '',
      isActive: user.isActive
    });

    // Password is optional when editing: blank means "leave it as it is".
    this.form.controls.password.clearValidators();
    this.form.controls.password.addValidators(Validators.minLength(8));
    this.form.controls.password.updateValueAndValidity();

    document.getElementById('user-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    this.form.reset({
      name: '', phone: '', email: '', roles: '',
      dateOfBirth: null, password: '', isActive: true
    });

    this.form.controls.password.setValidators([Validators.required, Validators.minLength(8)]);
    this.form.controls.password.updateValueAndValidity();

    this.editingId.set(null);
    this.emailTaken.set(false);
  }

  /**
   * Opens the set-a-password dialog with a strong one already generated.
   *
   * The legacy Users grid printed the plain-text `Password` column so an
   * administrator could read someone's sign-in back to them. Passwords are BCrypt
   * hashes now and cannot be reversed, so the equivalent is to *set* a known one
   * and hand that over — which is what this does.
   */
  openPasswordDialog(user: UserListItem): void {
    this.passwordUser.set(user);
    this.generatePassword();
    this.passwordVisible.set(true);
  }

  /**
   * A readable but strong password: no look-alike characters (0/O, 1/l/I), so it
   * survives being written on paper or read out over the phone.
   */
  generatePassword(): void {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const all = upper + lower + digits;

    const pick = (set: string, count: number) =>
      Array.from(crypto.getRandomValues(new Uint32Array(count)))
        .map(n => set[n % set.length]);

    // Guarantee one of each class, then fill, then shuffle so the classes are not
    // always in the same positions.
    const chars = [...pick(upper, 2), ...pick(lower, 4), ...pick(digits, 3), ...pick(all, 3)];

    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    this.sharePassword.set(chars.join(''));
  }

  copyPassword(): void {
    const value = this.sharePassword();
    if (!value) return;

    navigator.clipboard.writeText(value).then(
      () => this.messages.add({
        severity: 'success',
        summary: 'Copied',
        detail: 'Paste it into your message to the user.',
        life: 3000
      }),
      () => this.messages.add({
        severity: 'warn',
        summary: 'Could not copy',
        detail: 'Select the password and copy it manually.',
        life: 5000
      })
    );
  }

  savePassword(): void {
    const user = this.passwordUser();
    const value = this.sharePassword();

    if (!user) return;

    if (!value || this.sharePasswordInvalid()) {
      this.messages.add({
        severity: 'warn',
        summary: 'Check the password',
        detail: 'At least 8 characters, with upper case, lower case and a digit.',
        life: 5000
      });
      return;
    }

    this.passwordSaving.set(true);

    this.users.setPassword(user.id, value).subscribe({
      next: response => {
        this.passwordSaving.set(false);
        this.passwordVisible.set(false);
        this.messages.add({
          severity: 'success',
          summary: `Password set for ${user.name || user.email}`,
          detail: response.message ?? 'Share it with the user.',
          life: 8000
        });
        this.load();
      },
      error: (error: unknown) => {
        this.passwordSaving.set(false);

        if (error instanceof HttpErrorResponse) {
          const body = error.error as ApiResponse<unknown> | null;
          const detail = body?.errors?.length ? body.errors.join(' ') : body?.message;

          if (detail) {
            this.messages.add({
              severity: 'error',
              summary: 'Could not set the password',
              detail,
              life: 8000
            });
          }
        }
      }
    });
  }

  toggleStatus(user: UserListItem): void {
    const next = !user.isActive;

    this.confirm.confirm({
      header: next ? 'Activate user' : 'Deactivate user',
      message: next
        ? `Allow ${user.email} to sign in again?`
        : `Block ${user.email} from signing in? Any active session is ended immediately.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: next ? 'Activate' : 'Deactivate',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: next ? 'p-button-success' : 'p-button-danger',
      accept: () => {
        this.users.setStatus(user.id, next).subscribe({
          next: response => {
            this.messages.add({
              severity: 'success',
              summary: next ? 'Activated' : 'Deactivated',
              detail: response.message ?? '',
              life: 4000
            });
            this.load();
          }
        });
      }
    });
  }

  /* --------------------------------------------------------- birthdays */
  openBirthdays(): void {
    this.birthdaysVisible.set(true);
    this.birthdaysLoading.set(true);

    this.users.upcomingBirthdays(30).subscribe({
      next: data => {
        this.birthdays.set(data);
        this.birthdaysLoading.set(false);
      },
      error: () => this.birthdaysLoading.set(false)
    });
  }

  /* ------------------------------------------------------------ letters */

  /** Offer and experience letters are for staff only, as in the legacy page. */
  canIssueLetters(user: UserListItem): boolean {
    return isLetterEligible(user);
  }

  /** An experience letter needs a leaving date, so it waits for End_date. */
  canIssueExperience(user: UserListItem): boolean {
    return canIssueReleaseLetter(user);
  }

  /** Employee id is only meaningful for the staff roles — the legacy grid showed
      "Not Required" for everyone else. */
  employeeIdFor(user: UserListItem): string {
    return isLetterEligible(user) ? String(user.id) : 'Not Required';
  }

  openOfferLetterFor(user: UserListItem): void {
    this.ctcFor.set(user);
    this.ctcValue.set(null);
    this.ctcVisible.set(true);
  }

  confirmOfferLetter(): void {
    const user = this.ctcFor();
    const ctc = this.ctcValue();

    if (!user) return;

    if (ctc === null || !Number.isFinite(ctc) || ctc <= 0) {
      this.messages.add({
        severity: 'warn',
        summary: 'Enter a CTC',
        detail: 'Annual CTC must be a number greater than zero.',
        life: 5000
      });
      return;
    }

    this.ctcVisible.set(false);

    if (!openOfferLetter(user, ctc)) {
      this.warnPopupBlocked();
    }
  }

  openExperienceLetterFor(user: UserListItem): void {
    if (!openExperienceLetter(user)) {
      this.warnPopupBlocked();
    }
  }

  private warnPopupBlocked(): void {
    this.messages.add({
      severity: 'warn',
      summary: 'Popup blocked',
      detail: 'Allow popups for this site to open the letter.',
      life: 6000
    });
  }

  /* ----------------------------------------------------------- helpers */
  private toRequest(): UserSaveRequest {
    const v = this.form.getRawValue();

    return {
      name: v.name.trim(),
      email: v.email.trim(),
      roles: v.roles,
      phone: v.phone?.trim() || null,
      dateOfBirth: this.toIsoDate(v.dateOfBirth),
      // Blank on an edit means "keep the current password".
      password: v.password?.trim() ? v.password.trim() : null,
      isActive: v.isActive
    };
  }

  /** Local calendar date -> yyyy-MM-dd, avoiding the UTC shift toISOString() causes. */
  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }
}
