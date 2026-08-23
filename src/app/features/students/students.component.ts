import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { ApiResponse } from '../../core/models/api-response.model';
import { Observable } from 'rxjs';

import {
  BranchLookup,
  CourseLookup,
  StudentCreated,
  StudentListItem,
  StudentSaveRequest,
  TeacherLookup
} from '../../core/models/student.model';
import { StudentService } from '../../core/services/student.service';

type StatusFilter = 'active' | 'inactive' | 'all';

/**
 * Student registration — the migration of `Views/Home/Index.cshtml` and
 * `Scripts/Student.js`. Keeps the legacy single-screen layout (entry form above,
 * roster below) and every one of its fields and rules, but the form is a typed
 * reactive form and validation runs on the server too.
 */
@Component({
  selector: 'app-students',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DatePickerModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    TextareaModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './students.component.html',
  styleUrl: './students.component.scss'
})
export class StudentsComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly students = inject(StudentService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  /* ------------------------------------------------------------- state */
  readonly rows = signal<StudentListItem[]>([]);
  /** registrationId -> object URL for the photos of the rows currently shown. */
  private readonly photoUrls = signal<Map<string, string>>(new Map());
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  /** Set when editing; null while registering someone new. */
  readonly editingId = signal<number | null>(null);
  readonly editingRegistrationId = signal<string | null>(null);
  readonly editingBillNo = signal<string | null>(null);
  readonly nextRegistrationId = signal<string>('—');
  readonly nextBillNo = signal<string>('—');

  readonly courses = signal<CourseLookup[]>([]);
  readonly teachers = signal<TeacherLookup[]>([]);
  readonly branches = signal<BranchLookup[]>([]);

  /* ------------------------------------------------------------- photos */
  /** Legacy rule from Scripts/ImageFile.js: PNG/JPEG/GIF, 512 KB. */
  private readonly maxPhotoBytes = 512 * 1024;
  private readonly allowedPhotoTypes = ['image/png', 'image/jpeg', 'image/gif'];

  readonly photoUploading = signal(false);
  readonly photoError = signal<string | null>(null);
  /** Local preview of the photo for the student currently in the form. */
  readonly editingPhotoUrl = signal<string | null>(null);

  readonly statusFilter = signal<StatusFilter>('active');
  readonly searchRegistrationId = signal('');
  readonly searchName = signal('');

  readonly page = signal(1);
  readonly pageSize = signal(10);

  /** Re-registration picker. */
  readonly pickerVisible = signal(false);
  readonly pickerTerm = signal('');
  readonly pickerRows = signal<StudentListItem[]>([]);
  readonly pickerLoading = signal(false);

  readonly statusOptions = [
    { label: 'Active', value: 'active' as StatusFilter },
    { label: 'Inactive', value: 'inactive' as StatusFilter },
    { label: 'All', value: 'all' as StatusFilter }
  ];

  readonly teacherCountOptions = [
    { label: '1 teacher', value: 1 },
    { label: '2 teachers', value: 2 },
    { label: '3 teachers', value: 3 }
  ];

  readonly isEditing = computed(() => this.editingId() !== null);

  /** Upper bound for the date-of-birth picker. */
  readonly today = new Date();

  /* -------------------------------------------------------------- form */
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    guardianName: ['', [Validators.required, Validators.maxLength(300)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    address: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    personalEmail: [''],
    dateOfBirth: [null as Date | null, [Validators.required]],
    dateOfJoining: [null as Date | null, [Validators.required]],
    monthlyFees: [null as number | null, [Validators.required, Validators.min(0)]],
    admissionFees: [null as number | null, [Validators.required, Validators.min(0)]],
    courseId: [null as number | null, [Validators.required]],
    duration: [{ value: null as number | null, disabled: true }],
    teacherCount: [1 as number, [Validators.required]],
    primaryTeacherId: [null as number | null, [Validators.required]],
    secondTeacherId: [null as number | null],
    thirdTeacherId: [null as number | null],
    branchId: [null as number | null],
    isActive: [true],
    isComplete: [false]
  });

  /** How many teacher dropdowns are shown — the legacy `changeme()` behaviour. */
  readonly teacherCount = signal(1);

  constructor() {
    this.students.courses().subscribe({
      next: data => this.courses.set(data),
      error: () => this.courses.set([])
    });

    this.students.teachers().subscribe({
      next: data => this.teachers.set(data),
      error: () => this.teachers.set([])
    });

    this.students.branches().subscribe({
      next: data => this.branches.set(data),
      error: () => this.branches.set([])
    });

    this.refreshNextRegistration();
    this.load();

    // The branch code goes into the registration id, so the preview has to follow
    // whichever branch is selected.
    this.form.controls.branchId.valueChanges.subscribe(() => {
      if (!this.isEditing()) {
        this.refreshNextRegistration();
      }
    });

    // Keep the required-ness of slots 2 and 3 in step with the chosen count, and
    // clear any value that is no longer used.
    this.form.controls.teacherCount.valueChanges.subscribe(count => {
      const n = Number(count) || 1;
      this.teacherCount.set(n);

      const second = this.form.controls.secondTeacherId;
      const third = this.form.controls.thirdTeacherId;

      if (n >= 2) {
        second.addValidators(Validators.required);
      } else {
        second.removeValidators(Validators.required);
        second.setValue(null);
      }

      if (n >= 3) {
        third.addValidators(Validators.required);
      } else {
        third.removeValidators(Validators.required);
        third.setValue(null);
      }

      second.updateValueAndValidity({ emitEvent: false });
      third.updateValueAndValidity({ emitEvent: false });
    });

    // Course drives the read-only Duration box (legacy GetDuration1).
    this.form.controls.courseId.valueChanges.subscribe(courseId => {
      const course = this.courses().find(c => c.courseId === courseId);
      this.form.controls.duration.setValue(course?.duration ?? null);
    });

    // Reload whenever a filter changes.
    effect(() => {
      this.statusFilter();
      this.page();
      this.pageSize();
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.releasePhotoUrls();
    this.clearEditingPhoto();
  }

  /* -------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    const status = this.statusFilter();

    this.students
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
        isActive: status === 'all' ? null : status === 'active',
        registrationId: this.searchRegistrationId().trim() || null,
        name: this.searchName().trim() || null
      })
      .subscribe({
        next: result => {
          this.rows.set(result.items);
          this.totalCount.set(result.totalCount);
          this.loading.set(false);
          this.loadPhotos(result.items);
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
    this.searchRegistrationId.set('');
    this.searchName.set('');
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

    const duplicateTeacher = this.hasDuplicateTeachers();
    if (duplicateTeacher) {
      this.messages.add({
        severity: 'warn',
        summary: 'Duplicate teacher',
        detail: 'The same teacher cannot be selected more than once.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);
    const payload = this.toRequest();
    const id = this.editingId();

    const request$: Observable<ApiResponse<StudentCreated | boolean>> = id === null
      ? this.students.create(payload)
      : this.students.update(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);

        const created = id === null ? (response.data as StudentCreated) : null;

        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Student registered' : 'Student updated',
          detail: created
            ? `Registration id ${created.registrationId} assigned.`
            : response.message ?? 'Saved.',
          life: 6000
        });

        this.resetForm();
        this.refreshNextRegistration();
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        // The error interceptor already toasts; surface field errors too.
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

  edit(student: StudentListItem): void {
    this.editingId.set(student.id);
    this.editingRegistrationId.set(student.registrationId ?? null);
    this.editingBillNo.set(student.billNo ?? null);

    const count = student.teacherCount && student.teacherCount >= 1 && student.teacherCount <= 3
      ? student.teacherCount
      : 1;

    this.form.patchValue({
      name: student.name ?? '',
      guardianName: student.guardianName ?? '',
      phone: student.phone ?? '',
      address: student.address ?? '',
      email: student.email ?? '',
      dateOfBirth: this.toDate(student.dateOfBirth),
      dateOfJoining: this.toDate(student.dateOfJoining),
      monthlyFees: student.monthlyFees ?? null,
      admissionFees: student.admissionFees ?? null,
      courseId: student.courseId ?? null,
      teacherCount: count,
      primaryTeacherId: student.primaryTeacherId ?? null,
      secondTeacherId: student.secondTeacherId ?? null,
      thirdTeacherId: student.thirdTeacherId ?? null,
      branchId: student.branchId ?? null,
      isActive: student.isActive,
      isComplete: student.isComplete
    });

    this.form.controls.duration.setValue(student.courseDuration ?? null);
    this.teacherCount.set(count);

    this.photoError.set(null);
    this.clearEditingPhoto();
    if (student.hasPhoto && student.registrationId) {
      this.showEditingPhoto(student.registrationId);
    }

    document.getElementById('student-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    this.form.reset({
      name: '',
      guardianName: '',
      phone: '',
      address: '',
      email: '',
      personalEmail: '',
      dateOfBirth: null,
      dateOfJoining: null,
      monthlyFees: null,
      admissionFees: null,
      courseId: null,
      teacherCount: 1,
      primaryTeacherId: null,
      secondTeacherId: null,
      thirdTeacherId: null,
      branchId: null,
      isActive: true,
      isComplete: false
    });

    this.form.controls.duration.setValue(null);
    this.teacherCount.set(1);
    this.editingId.set(null);
    this.editingRegistrationId.set(null);
    this.editingBillNo.set(null);
    this.clearEditingPhoto();
    this.photoError.set(null);
  }

  /* ----------------------------------------------------------- actions */
  deactivate(student: StudentListItem): void {
    this.confirm.confirm({
      header: 'Deactivate student',
      message:
        `Deactivate ${student.name} (${student.registrationId})? ` +
        'The record is kept and can be reactivated — nothing is deleted.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Deactivate',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.students.deactivate(student.id).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: 'Deactivated',
              detail: `${student.name} is now inactive.`,
              life: 5000
            });
            this.load();
          }
        });
      }
    });
  }

  activate(student: StudentListItem): void {
    if (!student.registrationId) return;

    this.students.activate(student.registrationId).subscribe({
      next: () => {
        this.messages.add({
          severity: 'success',
          summary: 'Reactivated',
          detail: `${student.name} is active again.`,
          life: 5000
        });
        this.load();
      }
    });
  }

  printReceipt(student: StudentListItem): void {
    this.students.receipt(student.id).subscribe({
      next: receipt => this.openReceiptWindow(receipt),
      error: () => {
        /* interceptor toasts */
      }
    });
  }

  photoUrl(student: StudentListItem): string | null {
    return student.registrationId ? this.photoUrls().get(student.registrationId) ?? null : null;
  }

  /**
   * Pulls the photos for the rows on screen. They cannot be loaded straight from an
   * `<img src>` because the endpoint needs the bearer token, so each one is fetched
   * and held as an object URL until this page is replaced.
   */
  private loadPhotos(rows: StudentListItem[]): void {
    this.releasePhotoUrls();

    const wanted = rows
      .filter(r => r.hasPhoto && r.registrationId)
      .map(r => r.registrationId!);

    if (wanted.length === 0) return;

    for (const registrationId of wanted) {
      this.students.photoBlob(registrationId).subscribe({
        next: blob => {
          this.photoUrls.update(map => {
            const next = new Map(map);
            next.set(registrationId, URL.createObjectURL(blob));
            return next;
          });
        },
        // A missing or corrupt photo just leaves the placeholder avatar in place.
        error: () => undefined
      });
    }
  }

  private releasePhotoUrls(): void {
    for (const url of this.photoUrls().values()) {
      URL.revokeObjectURL(url);
    }

    this.photoUrls.set(new Map());
  }

  /* --------------------------------------------- re-registration picker */
  openPicker(): void {
    this.pickerTerm.set(this.form.controls.name.value ?? '');
    this.pickerRows.set([]);
    this.pickerVisible.set(true);

    if (this.pickerTerm().trim().length > 0) {
      this.searchPicker();
    }
  }

  searchPicker(): void {
    const term = this.pickerTerm().trim();
    if (term.length === 0) {
      this.pickerRows.set([]);
      return;
    }

    this.pickerLoading.set(true);

    // Search every status — a re-registering student is usually inactive.
    this.students
      .list({ page: 1, pageSize: 25, isActive: null, name: term })
      .subscribe({
        next: result => {
          this.pickerRows.set(result.items);
          this.pickerLoading.set(false);
        },
        error: () => this.pickerLoading.set(false)
      });
  }

  /**
   * Copies a past student's details into a blank form, exactly like the legacy
   * `selectStudent`. A brand-new registration id is issued on save — the old
   * record is left untouched.
   */
  pickForReRegistration(student: StudentListItem): void {
    this.resetForm();

    const count = student.teacherCount && student.teacherCount >= 1 && student.teacherCount <= 3
      ? student.teacherCount
      : 1;

    this.form.patchValue({
      name: student.name ?? '',
      guardianName: student.guardianName ?? '',
      phone: student.phone ?? '',
      address: student.address ?? '',
      email: student.email ?? '',
      dateOfBirth: this.toDate(student.dateOfBirth),
      dateOfJoining: new Date(),
      monthlyFees: student.monthlyFees ?? null,
      admissionFees: student.admissionFees ?? null,
      courseId: student.courseId ?? null,
      teacherCount: count,
      primaryTeacherId: student.primaryTeacherId ?? null,
      secondTeacherId: student.secondTeacherId ?? null,
      thirdTeacherId: student.thirdTeacherId ?? null,
      branchId: student.branchId ?? null,
      isActive: true,
      isComplete: false
    });

    this.form.controls.duration.setValue(student.courseDuration ?? null);
    this.teacherCount.set(count);
    this.pickerVisible.set(false);

    this.messages.add({
      severity: 'info',
      summary: 'Details copied',
      detail: 'Review the form and save to issue a new registration id.',
      life: 6000
    });
  }

  /* ------------------------------------------------------ photo upload */

  /**
   * Uploads a photo for the student being edited. Keyed by registration id, exactly
   * like the legacy `Home/SaveFiles`, so a photo can only be attached once the
   * student has a number — i.e. after the record is saved.
   */
  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    this.photoError.set(null);
    if (!file) return;

    const registrationId = this.editingRegistrationId();
    if (!registrationId) {
      this.photoError.set('Save the student first — the photo is filed against the registration id.');
      input.value = '';
      return;
    }

    if (!this.allowedPhotoTypes.includes(file.type)) {
      this.photoError.set('Only PNG, JPEG and GIF images are allowed.');
      input.value = '';
      return;
    }

    if (file.size > this.maxPhotoBytes) {
      this.photoError.set(
        `Image must be ${this.maxPhotoBytes / 1024} KB or smaller (this one is ${Math.round(file.size / 1024)} KB).`);
      input.value = '';
      return;
    }

    this.photoUploading.set(true);

    this.students.uploadPhoto(registrationId, file).subscribe({
      next: () => {
        this.photoUploading.set(false);
        input.value = '';

        this.messages.add({
          severity: 'success',
          summary: 'Photo uploaded',
          detail: `Saved against ${registrationId}.`,
          life: 5000
        });

        this.showEditingPhoto(registrationId);
        this.load();
      },
      error: (error: unknown) => {
        this.photoUploading.set(false);
        input.value = '';

        if (error instanceof HttpErrorResponse) {
          const body = error.error as ApiResponse<unknown> | null;
          this.photoError.set(body?.errors?.join(' ') || body?.message || 'Upload failed.');
        }
      }
    });
  }

  removePhoto(): void {
    const registrationId = this.editingRegistrationId();
    if (!registrationId) return;

    this.confirm.confirm({
      header: 'Remove photo',
      message: `Remove the photo filed against ${registrationId}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.students.deletePhoto(registrationId).subscribe({
          next: () => {
            this.clearEditingPhoto();
            this.messages.add({ severity: 'success', summary: 'Photo removed', life: 4000 });
            this.load();
          }
        });
      }
    });
  }

  private showEditingPhoto(registrationId: string): void {
    this.students.photoBlob(registrationId).subscribe({
      next: blob => {
        this.clearEditingPhoto();
        this.editingPhotoUrl.set(URL.createObjectURL(blob));
      },
      error: () => this.clearEditingPhoto()
    });
  }

  private clearEditingPhoto(): void {
    const url = this.editingPhotoUrl();
    if (url) URL.revokeObjectURL(url);
    this.editingPhotoUrl.set(null);
  }

  /* ----------------------------------------------------------- helpers */
  private hasDuplicateTeachers(): boolean {
    const picked = [
      this.form.controls.primaryTeacherId.value,
      this.form.controls.secondTeacherId.value,
      this.form.controls.thirdTeacherId.value
    ].filter((id): id is number => typeof id === 'number' && id > 0);

    return new Set(picked).size !== picked.length;
  }

  private toRequest(): StudentSaveRequest {
    const v = this.form.getRawValue();

    return {
      name: v.name.trim(),
      guardianName: v.guardianName.trim(),
      address: v.address.trim(),
      phone: v.phone.trim(),
      email: v.email.trim(),
      personalEmail: v.personalEmail?.trim() || null,
      dateOfBirth: this.toIsoDate(v.dateOfBirth),
      dateOfJoining: this.toIsoDate(v.dateOfJoining),
      monthlyFees: v.monthlyFees,
      admissionFees: v.admissionFees,
      courseId: v.courseId,
      teacherCount: Number(v.teacherCount),
      primaryTeacherId: v.primaryTeacherId,
      secondTeacherId: Number(v.teacherCount) >= 2 ? v.secondTeacherId : null,
      thirdTeacherId: Number(v.teacherCount) >= 3 ? v.thirdTeacherId : null,
      branchId: v.branchId,
      isActive: v.isActive,
      isComplete: v.isComplete
    };
  }

  /** Local calendar date -> yyyy-MM-dd, without the UTC shift toISOString() causes. */
  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }

  private toDate(value?: string): Date | null {
    if (!value) return null;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private refreshNextRegistration(): void {
    this.students.nextRegistrationNo(this.form.controls.branchId.value).subscribe({
      next: next => {
        this.nextRegistrationId.set(next.registrationId);
        this.nextBillNo.set(next.billNo);
      },
      error: () => {
        this.nextRegistrationId.set('—');
        this.nextBillNo.set('—');
      }
    });
  }

  /** Opens the admission receipt in a print window (replaces PrintReport.cshtml). */
  private openReceiptWindow(receipt: {
    name?: string;
    registrationId?: string;
    billNo?: string;
    courseName?: string;
    admissionFees?: number;
    admissionFeesInWords: string;
    dateOfJoining?: string;
    nextDueDate?: string;
  }): void {
    const win = window.open('', '_blank', 'width=760,height=900');
    if (!win) {
      this.messages.add({
        severity: 'warn',
        summary: 'Popup blocked',
        detail: 'Allow popups for this site to print the receipt.',
        life: 6000
      });
      return;
    }

    const money = (value?: number) =>
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value ?? 0);

    const date = (value?: string) =>
      value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    const esc = (value?: string) =>
      (value ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

    win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Admission receipt ${esc(receipt.registrationId)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2430; margin: 32px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }
  .sub { color: #6b7280; font-size: 13px; margin-top: 4px; }
  .head { border-bottom: 2px solid #6d28d9; padding-bottom: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 9px 4px; border-bottom: 1px solid #e4e6ef; }
  th { width: 40%; color: #6b7280; font-weight: 600; }
  .words { margin-top: 20px; font-size: 13px; font-style: italic; color: #384152; }
  .sign { margin-top: 64px; display: flex; justify-content: space-between; font-size: 13px; color: #6b7280; }
  @media print { body { margin: 12mm; } }
</style></head><body>
  <div class="head">
    <h1>Avijan &mdash; Admission Receipt</h1>
    <div class="sub">Bill No. ${esc(receipt.billNo)}</div>
  </div>
  <table>
    <tr><th>Student name</th><td>${esc(receipt.name)}</td></tr>
    <tr><th>Registration id</th><td>${esc(receipt.registrationId)}</td></tr>
    <tr><th>Course</th><td>${esc(receipt.courseName)}</td></tr>
    <tr><th>Date of joining</th><td>${date(receipt.dateOfJoining)}</td></tr>
    <tr><th>Admission fees</th><td>${money(receipt.admissionFees)}</td></tr>
    <tr><th>Next payment due</th><td>${date(receipt.nextDueDate)}</td></tr>
  </table>
  <p class="words">Rupees ${esc(receipt.admissionFeesInWords)} only.</p>
  <div class="sign"><span>Student / Guardian signature</span><span>For Avijan</span></div>
  <script>window.onload = function () { window.print(); };<\/script>
</body></html>`);

    win.document.close();
  }
}
