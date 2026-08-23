import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, debounceTime, distinctUntilChanged } from 'rxjs';

import { ApiResponse } from '../../core/models/api-response.model';
import { TeacherEarning, TeacherListItem, TeacherSaveRequest } from '../../core/models/master.model';
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
    this.loadEarnings();
  }

  /* ----------------------------------------------------------- helpers */
  money(value?: number | null): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value ?? 0);
  }

  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }
}
