import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { CourseEnquiry, EnquiryStatus } from '../../core/models/enquiry.model';
import { BranchLookup, CourseLookup } from '../../core/models/student.model';
import { AuthService } from '../../core/services/auth.service';
import { EnquiryService } from '../../core/services/enquiry.service';
import { StudentService } from '../../core/services/student.service';

type StatusFilter = 'all' | 'due' | EnquiryStatus;

/**
 * The walk-in enquiry register.
 *
 * Someone comes to the counter and asks about a course. This is where the
 * receptionist writes down who they were and how to reach them, and where the
 * institute comes back to chase it.
 *
 * Not the same screen as the dashboard's "New enquiries", which is the public
 * website's contact form.
 */
@Component({
  selector: 'app-enquiries',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    TextareaModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './enquiries.component.html',
  styleUrl: './enquiries.component.scss'
})
export class EnquiriesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly enquiries = inject(EnquiryService);
  private readonly students = inject(StudentService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);

  /* ------------------------------------------------------------- state */
  readonly rows = signal<CourseEnquiry[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  readonly courses = signal<CourseLookup[]>([]);
  readonly branches = signal<BranchLookup[]>([]);

  readonly page = signal(1);
  readonly pageSize = signal(10);

  readonly search = signal('');
  readonly statusFilter = signal<StatusFilter>('all');

  /** Deleting is the administrator's alone — the server enforces it too. */
  readonly canDelete = computed(() => this.auth.hasAnyRole(['Admin']));

  readonly today = new Date();

  readonly statusOptions = [
    { label: 'All', value: 'all' as StatusFilter },
    { label: 'Due', value: 'due' as StatusFilter },
    { label: 'New', value: 'New' as StatusFilter },
    { label: 'Following', value: 'Following' as StatusFilter },
    { label: 'Converted', value: 'Converted' as StatusFilter },
    { label: 'Not interested', value: 'NotInterested' as StatusFilter }
  ];

  /* -------------------------------------------------------------- form */
  readonly form = this.fb.nonNullable.group({
    studentName: ['', [Validators.required, Validators.maxLength(200)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    address: [''],
    courseId: [null as number | null],
    remarks: [''],
    enquiryDate: [new Date() as Date | null, [Validators.required]],
    nextFollowUpOn: [null as Date | null],
    branchId: [null as number | null]
  });

  /* --------------------------------------------------- follow-up dialog */
  readonly followUpVisible = signal(false);
  readonly followUpTarget = signal<CourseEnquiry | null>(null);
  readonly followUpSaving = signal(false);

  readonly followUpForm = this.fb.nonNullable.group({
    status: ['Following' as EnquiryStatus, [Validators.required]],
    remarks: ['', [Validators.maxLength(500)]],
    nextFollowUpOn: [null as Date | null],
    convertedStudentRegistrationId: ['']
  });

  readonly followUpStatusOptions = [
    { label: 'Following', value: 'Following' as EnquiryStatus },
    { label: 'Converted', value: 'Converted' as EnquiryStatus },
    { label: 'Not interested', value: 'NotInterested' as EnquiryStatus }
  ];

  /** Closed enquiries take no next date — the server refuses one. */
  readonly followUpIsClosing = computed(() => {
    const status = this.followUpForm.controls.status.value;
    return status === 'Converted' || status === 'NotInterested';
  });

  constructor() {
    this.students.courses().subscribe({
      next: data => this.courses.set(data),
      error: () => this.courses.set([])
    });

    this.students.branches().subscribe({
      next: data => this.branches.set(data),
      error: () => this.branches.set([])
    });

    this.load();
  }

  /* -------------------------------------------------------------- read */

  load(): void {
    this.loading.set(true);

    const status = this.statusFilter();

    this.enquiries.list({
      page: this.page(),
      pageSize: this.pageSize(),
      search: this.search().trim() || null,
      status: status === 'all' || status === 'due' ? null : status,
      dueOnly: status === 'due'
    }).subscribe({
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
    this.pageSize.set(size);
    this.page.set(Math.floor((event.first ?? 0) / size) + 1);
    this.load();
  }

  applyFilter(): void {
    this.page.set(1);
    this.load();
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.applyFilter();
  }

  /* ------------------------------------------------------------- write */

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const request = this.toRequest();
    const id = this.editingId();

    const done = (detail: string) => {
      this.saving.set(false);
      this.messages.add({ severity: 'success', summary: 'Saved', detail, life: 4000 });
      this.reset();
      this.load();
    };

    if (id === null) {
      this.enquiries.create(request).subscribe({
        next: () => done('Enquiry recorded.'),
        error: () => this.saving.set(false)
      });
    } else {
      this.enquiries.update(id, request).subscribe({
        next: () => done('Enquiry updated.'),
        error: () => this.saving.set(false)
      });
    }
  }

  edit(enquiry: CourseEnquiry): void {
    this.editingId.set(enquiry.id);

    this.form.setValue({
      studentName: enquiry.studentName,
      phone: enquiry.phone,
      address: enquiry.address ?? '',
      courseId: enquiry.courseId ?? null,
      remarks: enquiry.remarks ?? '',
      enquiryDate: this.toDate(enquiry.enquiryDate),
      nextFollowUpOn: this.toDate(enquiry.nextFollowUpOn),
      branchId: enquiry.branchId ?? null
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  reset(): void {
    this.editingId.set(null);
    this.form.reset({
      studentName: '',
      phone: '',
      address: '',
      courseId: null,
      remarks: '',
      enquiryDate: new Date(),
      nextFollowUpOn: null,
      branchId: null
    });
  }

  remove(enquiry: CourseEnquiry): void {
    this.confirm.confirm({
      header: 'Delete enquiry',
      message: `Delete the enquiry from ${enquiry.studentName}? The record of who walked in is lost.`,
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.enquiries.delete(enquiry.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Deleted', detail: 'Enquiry removed.', life: 4000 });
            this.load();
          }
        });
      }
    });
  }

  /* --------------------------------------------------------- follow-up */

  openFollowUp(enquiry: CourseEnquiry): void {
    this.followUpTarget.set(enquiry);

    this.followUpForm.reset({
      status: enquiry.status === 'New' ? 'Following' : (enquiry.status as EnquiryStatus),
      remarks: '',
      nextFollowUpOn: null,
      convertedStudentRegistrationId: enquiry.convertedStudentRegistrationId ?? ''
    });

    this.followUpVisible.set(true);
  }

  saveFollowUp(): void {
    const target = this.followUpTarget();
    if (!target || this.followUpForm.invalid) {
      this.followUpForm.markAllAsTouched();
      return;
    }

    this.followUpSaving.set(true);
    const v = this.followUpForm.getRawValue();

    this.enquiries.recordFollowUp(target.id, {
      status: v.status,
      remarks: v.remarks.trim() || null,
      // A closed enquiry takes no next date, whatever is sitting in the picker.
      nextFollowUpOn: this.followUpIsClosing() ? null : this.toIsoDate(v.nextFollowUpOn),
      convertedStudentRegistrationId: v.convertedStudentRegistrationId.trim() || null
    }).subscribe({
      next: () => {
        this.followUpSaving.set(false);
        this.followUpVisible.set(false);
        this.messages.add({
          severity: 'success', summary: 'Recorded', detail: 'Follow-up saved.', life: 4000
        });
        this.load();
      },
      error: () => this.followUpSaving.set(false)
    });
  }

  /* ----------------------------------------------------------- display */

  severityFor(status: EnquiryStatus): 'info' | 'warn' | 'success' | 'danger' {
    switch (status) {
      case 'New': return 'info';
      case 'Following': return 'warn';
      case 'Converted': return 'success';
      default: return 'danger';
    }
  }

  labelFor(status: EnquiryStatus): string {
    return status === 'NotInterested' ? 'Not interested' : status;
  }

  /* ----------------------------------------------------------- helpers */

  private toRequest() {
    const v = this.form.getRawValue();

    return {
      studentName: v.studentName.trim(),
      phone: v.phone.trim(),
      address: v.address.trim() || null,
      courseId: v.courseId,
      remarks: v.remarks.trim() || null,
      enquiryDate: this.toIsoDate(v.enquiryDate),
      nextFollowUpOn: this.toIsoDate(v.nextFollowUpOn),
      branchId: v.branchId
    };
  }

  /** Local calendar date -> yyyy-MM-dd, without the shift toISOString() causes. */
  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }

  private toDate(value?: string): Date | null {
    return value ? new Date(value) : null;
  }
}
