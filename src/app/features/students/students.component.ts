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

import { Observable, debounceTime, distinctUntilChanged } from 'rxjs';

import { ApiResponse } from '../../core/models/api-response.model';
import {
  BranchLookup,
  CourseLookup,
  StudentCreated,
  StudentListItem,
  StudentSaveRequest,
  SuggestedLogin,
  TeacherLookup
} from '../../core/models/student.model';
import { AdmissionDueDialogComponent } from '../../shared/admission-due/admission-due-dialog.component';
import { resizeImageToLimit } from '../../core/images/image-resize';
import { admissionReceiptMessage, canWhatsApp, openWhatsApp } from '../../core/messaging/whatsapp';
import {
  admissionReceiptHtml,
  certificateHtml,
  openPendingDocumentWindow,
  writeDocumentWindow
} from '../../core/printing/legacy-documents';
import { saveCertificatePdf } from '../../core/printing/pdf-download';
import { AuthService } from '../../core/services/auth.service';
import { ReportService } from '../../core/services/report.service';
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
    TooltipModule,
    AdmissionDueDialogComponent
  ],
  providers: [ConfirmationService],
  templateUrl: './students.component.html',
  styleUrl: './students.component.scss'
})
export class StudentsComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly students = inject(StudentService);
  private readonly reports = inject(ReportService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);

  /* Deactivating is the administrator's alone — the server enforces it too. The
     receptionist works this screen all day, and a button that always answers
     "you do not have permission" reads as the page being broken for them. */
  readonly canDeactivate = computed(() => this.auth.hasAnyRole(['Admin']));

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

  /**
   * True once "paying now" has been typed over by hand, after which it stops
   * following the admission fee.
   */
  private readonly admissionPaidEdited = signal(false);

  /** What the form is about to leave owing, for the hint under the field. */
  readonly admissionDueNow = signal(0);

  /* ------------------------------------------ collecting an admission due */
  readonly admissionDueStudentId = signal<number | null>(null);
  admissionDueVisible = false;

  /* -------------------------------------------------------------- form */
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    guardianName: ['', [Validators.required, Validators.maxLength(300)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    address: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    /* Required for a new admission - the welcome message goes here - but not
       when editing, because 932 of the 953 migrated students have none and
       must still be editable. applyPersonalEmailRule() switches it. */
    personalEmail: ['', [Validators.email]],

    /* Issued automatically from the name. Editable, but pre-filled. */
    avijanLoginEmail: [''],
    avijanLoginPassword: [''],

    dateOfBirth: [null as Date | null, [Validators.required]],
    dateOfJoining: [null as Date | null, [Validators.required]],
    monthlyFees: [null as number | null, [Validators.required, Validators.min(0)]],
    admissionFees: [null as number | null, [Validators.required, Validators.min(0)]],
    /* What is actually being handed over now. Tracks the fee unless the counter
       changes it, so the ordinary paid-in-full admission needs no extra thought. */
    admissionFeesPaid: [null as number | null, [Validators.min(0)]],
    admissionPaymentMode: ['Cash' as 'Cash' | 'Bank', [Validators.required]],
    courseId: [null as number | null, [Validators.required]],
    duration: [{ value: null as number | null, disabled: true }],
    teacherCount: [1 as number, [Validators.required]],
    primaryTeacherId: [null as number | null, [Validators.required]],
    secondTeacherId: [null as number | null],
    thirdTeacherId: [null as number | null],
    branchId: [null as number | null, [Validators.required]],
    isActive: [true],
    isComplete: [false]
  });

  /** How many teacher dropdowns are shown — the legacy `changeme()` behaviour. */
  readonly teacherCount = signal(1);

  /* ------------------------------------------------------- portal sign-in */

  /**
   * Set once the operator types in either sign-in box, which stops the name from
   * overwriting what they entered.
   */
  readonly loginEdited = signal(false);
  readonly loginSuggesting = signal(false);

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

    /* "Paying now" follows the admission fee until somebody types over it. The
       common admission is paid in full, and making the counter fill in the same
       number twice would be the sort of friction that gets it typed wrong. Once
       edited by hand it stops following, so a deliberate part payment is not
       silently reset by a later correction to the fee. */
    this.form.controls.admissionFees.valueChanges.subscribe(fee => {
      if (!this.isEditing() && !this.admissionPaidEdited()) {
        this.form.controls.admissionFeesPaid.setValue(fee, { emitEvent: false });
      }

      this.syncAdmissionPaid();
    });

    this.form.controls.admissionFeesPaid.valueChanges.subscribe(paid => {
      const fee = this.form.controls.admissionFees.value ?? 0;

      // Back to the full fee counts as "not a part payment" again, so the field
      // resumes following rather than sticking at whatever was typed.
      this.admissionPaidEdited.set(paid !== null && paid !== fee);

      this.syncAdmissionPaid();
    });

    // The portal sign-in is derived from the student's name, so it follows what is
    // typed — but only while registering, and only until someone edits it by hand.
    // Re-deriving it for an existing student would change a login already in use.
    this.form.controls.name.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(name => {
        if (this.isEditing() || this.loginEdited()) {
          return;
        }

        this.refreshSuggestedLogin(name);
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
            ? `Registration id ${created.registrationId} assigned. You can now attach a photo below.`
            : response.message ?? 'Saved.',
          life: 6000
        });

        if (created) {
          /* The photo endpoint is keyed by registration id, which does not exist
             until this save returns it — so a brand-new registration used to
             have to be saved, closed, found again in the list and reopened
             before a photo could be attached at all. Dropping straight into
             editing this same, just-created record instead keeps the form
             open with everything already typed, and reveals the photo
             fieldset (gated on isEditing()) immediately. */
          this.editingId.set(created.id);
          this.editingRegistrationId.set(created.registrationId);
          this.editingBillNo.set(created.billNo);
          this.loginEdited.set(true);
          this.photoError.set(null);
          this.clearEditingPhoto();
        } else {
          this.resetForm();
        }

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
    this.applyPersonalEmailRule();
    this.applyBranchRule();
    // An existing student keeps the login they were issued; do not re-derive it.
    this.loginEdited.set(true);
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
      personalEmail: student.personalEmail ?? '',
      dateOfBirth: this.toDate(student.dateOfBirth),
      dateOfJoining: this.toDate(student.dateOfJoining),
      monthlyFees: student.monthlyFees ?? null,
      admissionFees: student.admissionFees ?? null,
      admissionFeesPaid: student.admissionFeesPaid ?? student.admissionFees ?? null,
      admissionPaymentMode: student.admissionPaymentMode ?? 'Cash',
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
      avijanLoginEmail: '',
      avijanLoginPassword: '',
      dateOfBirth: null,
      dateOfJoining: null,
      monthlyFees: null,
      admissionFees: null,
      admissionFeesPaid: null,
      admissionPaymentMode: 'Cash',
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
    this.applyPersonalEmailRule();
    this.applyBranchRule();
    this.loginEdited.set(false);
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

  /** Greys out the button when the stored number cannot be a WhatsApp one. */
  canWhatsApp(phone?: string | null): boolean {
    return canWhatsApp(phone);
  }

  /**
   * Opens WhatsApp with the admission receipt typed out to the student.
   *
   * The receipt is fetched first rather than assembled from the row: the figures a
   * student is sent must be the same ones the printed receipt shows, and only the
   * server knows the amount in words and the next due date.
   */
  whatsAppReceipt(student: StudentListItem): void {
    this.students.receipt(student.id).subscribe({
      next: receipt => {
        if (!openWhatsApp(student.phone, admissionReceiptMessage(receipt))) {
          this.messages.add({
            severity: 'warn',
            summary: 'Could not open WhatsApp',
            detail: 'Allow popups for this site, and check the mobile number on the record.',
            life: 6000
          });
        }
      },
      error: () => {
        /* interceptor toasts */
      }
    });
  }

  /** Opens the shared dialog for whatever is left owing on this admission fee. */
  openAdmissionDue(student: StudentListItem): void {
    this.admissionDueStudentId.set(student.id);
    this.admissionDueVisible = true;
  }

  /** Same dialog, opened from the edit form rather than a row. */
  openAdmissionDueById(studentId: number): void {
    this.admissionDueStudentId.set(studentId);
    this.admissionDueVisible = true;
  }

  /** The balance moved, so the row's figures and its button have to follow. */
  onAdmissionDueCollected(): void {
    this.load();

    /* If the student being edited is the one just collected against, the received
       figure on the form is stale too. Set without emitting: a collection is not
       the user typing a correction, so it must not mark the field as hand-edited. */
    const id = this.editingId();
    if (id !== null && id === this.admissionDueStudentId()) {
      this.students.admissionDue(id).subscribe({
        next: d => {
          this.form.controls.admissionFeesPaid.setValue(d.admissionFeesPaid, { emitEvent: false });
          this.syncAdmissionPaid();
        }
      });
    }
  }

  printReceipt(student: StudentListItem): void {
    const win = openPendingDocumentWindow(900, 950);

    this.students.receipt(student.id).subscribe({
      next: receipt => {
        if (!writeDocumentWindow(win, admissionReceiptHtml(receipt))) {
          this.messages.add({
            severity: 'warn',
            summary: 'Popup blocked',
            detail: 'Allow popups for this site to print the receipt.',
            life: 6000
          });
        }
      },
      error: () => {
        win?.close();
        /* interceptor toasts */
      }
    });
  }

  readonly certificateLoading = signal<number | null>(null);

  /**
   * The office's version of the student portal's Download Certificate button —
   * for a student standing at the counter, not signed in themselves. Only shown
   * once the course is marked complete; the server refuses it either way, this
   * just saves the round trip to find that out.
   */
  issueCertificate(student: StudentListItem): void {
    if (!student.registrationId) return;

    this.certificateLoading.set(student.id);

    const win = openPendingDocumentWindow(1180);

    this.reports.issueCertificateFor(student.registrationId).subscribe({
      next: certificate => {
        this.certificateLoading.set(null);

        if (certificate.isDuplicate) {
          this.messages.add({
            severity: 'info',
            summary: `Duplicate copy — no. ${certificate.issueNo}`,
            detail:
              `${certificate.issueNo - 1} ${certificate.issueNo === 2 ? 'copy has' : 'copies have'} ` +
              `already been taken of this certificate. This one is marked DUPLICATE COPY.`,
            life: 9000
          });
        }

        saveCertificatePdf(certificate).catch(() =>
          this.messages.add({
            severity: 'warn',
            summary: 'PDF not saved',
            detail: 'Could not save the certificate as a PDF. Try again.',
            life: 6000
          }));

        if (!writeDocumentWindow(win, certificateHtml(certificate))) {
          this.messages.add({
            severity: 'warn',
            summary: 'Popup blocked',
            detail: 'Allow popups for this site to print the certificate.',
            life: 6000
          });
        }
      },
      error: (error: unknown) => {
        this.certificateLoading.set(null);
        win?.close();

        const body = error instanceof HttpErrorResponse ? (error.error as ApiResponse<unknown> | null) : null;

        this.messages.add({
          severity: 'error',
          summary: 'Certificate not issued',
          detail: body?.message ?? 'The certificate could not be issued.',
          life: 8000
        });
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
      personalEmail: student.personalEmail ?? '',
      dateOfBirth: this.toDate(student.dateOfBirth),
      dateOfJoining: new Date(),
      monthlyFees: student.monthlyFees ?? null,
      admissionFees: student.admissionFees ?? null,
      admissionFeesPaid: student.admissionFees ?? null,
      admissionPaymentMode: 'Cash',
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
  async onPhotoSelected(event: Event): Promise<void> {
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

    input.value = '';

    /* A real phone-camera photo is routinely 2-8 MB — comfortably over the
       512 KB the server accepts — so most genuine uploads would otherwise
       bounce off the size check with nothing the person could do about it
       short of finding a separate compression tool first. Resized down to
       the limit here instead, automatically, before it ever reaches that
       check. GIFs pass through untouched (see resizeImageToLimit) and still
       hit the plain error below if they are themselves too large. */
    let upload = file;
    if (file.size > this.maxPhotoBytes) {
      this.photoUploading.set(true);
      try {
        upload = await resizeImageToLimit(file, this.maxPhotoBytes);
      } catch {
        // Resizing failed for some reason (a corrupt file, an unsupported
        // browser API) — fall through to the size check below, which will
        // report it clearly rather than upload silently failing.
      }
    }

    if (upload.size > this.maxPhotoBytes) {
      this.photoUploading.set(false);
      this.photoError.set(
        upload === file
          ? `Image must be ${this.maxPhotoBytes / 1024} KB or smaller (this one is ${Math.round(file.size / 1024)} KB).`
          : `Even after reducing it, this image is still ${Math.round(upload.size / 1024)} KB — ` +
            `please try a smaller or simpler photo.`);
      return;
    }

    this.photoUploading.set(true);

    this.students.uploadPhoto(registrationId, upload).subscribe({
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
      /* Editing sends the field as it stands -- an empty box is an explicit
         clear, never null. Null tells the server "not sent, keep what is there",
         which is the guard against the wipe this form used to cause. */
      personalEmail: this.isEditing() ? (v.personalEmail?.trim() ?? '') : (v.personalEmail?.trim() || null),
      avijanLoginEmail: v.avijanLoginEmail?.trim() || null,
      avijanLoginPassword: v.avijanLoginPassword?.trim() || null,
      dateOfBirth: this.toIsoDate(v.dateOfBirth),
      dateOfJoining: this.toIsoDate(v.dateOfJoining),
      monthlyFees: v.monthlyFees,
      admissionFees: v.admissionFees,
      /* Registering: null when it equals the fee, so the server books an ordinary
         paid-in-full admission. Editing: always sent -- it is the received figure
         being corrected, and the server adjusts the admission receipt to match. */
      admissionFeesPaid:
        !this.isEditing() && v.admissionFeesPaid === v.admissionFees ? null : v.admissionFeesPaid,
      admissionPaymentMode: v.admissionPaymentMode,
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

  /**
   * Fills the sign-in boxes with what the server would issue for this name.
   *
   * The legacy form built the address and password in the browser; asking the
   * server means the uniqueness check runs against the database, so two students
   * with the same name get distinct logins instead of a duplicate account.
   */
  private refreshSuggestedLogin(name: string | null | undefined): void {
    const trimmed = (name ?? '').trim();

    if (!trimmed) {
      this.form.patchValue(
        { avijanLoginEmail: '', avijanLoginPassword: '' },
        { emitEvent: false });
      return;
    }

    this.loginSuggesting.set(true);

    this.students.suggestLogin(trimmed, this.editingId()).subscribe({
      next: (login: SuggestedLogin) => {
        this.form.patchValue(
          { avijanLoginEmail: login.email, avijanLoginPassword: login.password },
          { emitEvent: false });

        this.loginSuggesting.set(false);
      },
      error: () => this.loginSuggesting.set(false)
    });
  }

  /** Re-derives the sign-in from the name, discarding any manual edit. */
  regenerateLogin(): void {
    this.loginEdited.set(false);
    this.refreshSuggestedLogin(this.form.controls.name.value);
  }

  /** Called from the two sign-in inputs, so typing in them stops auto-fill. */
  markLoginEdited(): void {
    this.loginEdited.set(true);
  }

  /**
   * Keeps the "will be left owing" hint and the upper bound on "paying now" in
   * step with the two figures. The bound is applied here rather than as a fixed
   * validator because what counts as too much depends on the fee beside it.
   */
  private syncAdmissionPaid(): void {
    const fee = this.form.controls.admissionFees.value ?? 0;
    const paid = this.form.controls.admissionFeesPaid.value;
    const control = this.form.controls.admissionFeesPaid;

    const effective = paid ?? fee;
    const due = fee - effective;
    this.admissionDueNow.set(due > 0 ? due : 0);

    const overpaid = paid !== null && paid > fee;
    const already = control.hasError('max');

    // Touched only when it actually changes: setErrors re-runs form status and
    // would otherwise loop through this same subscription.
    if (overpaid && !already) {
      control.setErrors({ ...(control.errors ?? {}), max: true });
    } else if (!overpaid && already) {
      const { max, ...rest } = control.errors ?? {};
      control.setErrors(Object.keys(rest).length > 0 ? rest : null);
    }
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

  /**
   * Personal email is mandatory for a new admission and optional when editing.
   *
   * The server enforces the same split (POST requires it, PUT does not). It has
   * to be a split: 932 of the 953 migrated students carry no personal email,
   * 219 of them still active, so a blanket rule would lock those records.
   */
  private applyPersonalEmailRule(): void {
    const control = this.form.controls.personalEmail;

    control.setValidators(
      this.isEditing()
        ? [Validators.email]
        : [Validators.required, Validators.email]
    );

    control.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * Branch is required for a new admission - its code goes into the registration
   * id, and the branch reports only add up when nothing is unattributed.
   *
   * Editing is left alone on purpose. Students admitted before this rule are all
   * recorded against Rajpur, and a stricter rule on edit would turn an unrelated
   * correction, like fixing a phone number, into a branch decision.
   */
  private applyBranchRule(): void {
    const control = this.form.controls.branchId;

    control.setValidators(this.isEditing() ? [] : [Validators.required]);
    control.updateValueAndValidity({ emitEvent: false });
  }
}
