import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { EnquiryReport, EnquiryStatus } from '../../../core/models/enquiry.model';
import { BranchLookup, CourseLookup } from '../../../core/models/student.model';
import { EnquiryService } from '../../../core/services/enquiry.service';
import { StudentService } from '../../../core/services/student.service';

/**
 * The follow-up report on the walk-in enquiry register.
 *
 * Answers the three questions the office actually asks: how many people came in,
 * how many of them enrolled, and who is still waiting on a call that never came.
 */
@Component({
  selector: 'app-enquiry-report',
  imports: [
    CommonModule, FormsModule, ButtonModule, DatePickerModule,
    SelectModule, TableModule, TagModule, TooltipModule
  ],
  templateUrl: './enquiry-report.component.html',
  styleUrl: './enquiry-report.component.scss'
})
export class EnquiryReportComponent {
  private readonly enquiries = inject(EnquiryService);
  private readonly students = inject(StudentService);

  readonly report = signal<EnquiryReport | null>(null);
  readonly loading = signal(false);

  readonly courses = signal<CourseLookup[]>([]);
  readonly branches = signal<BranchLookup[]>([]);

  /* Defaults to this month, which is the range the office asks for most and the
     one that makes the conversion figure mean something. */
  readonly fromDate = signal<Date | null>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly toDate = signal<Date | null>(new Date());

  readonly status = signal<string | null>(null);
  readonly courseId = signal<number | null>(null);
  readonly branchId = signal<number | null>(null);
  readonly dueOnly = signal(false);

  readonly statusOptions = [
    { label: 'All statuses', value: null },
    { label: 'New', value: 'New' },
    { label: 'Following', value: 'Following' },
    { label: 'Converted', value: 'Converted' },
    { label: 'Not interested', value: 'NotInterested' }
  ];

  constructor() {
    this.students.courses().subscribe({
      next: data => this.courses.set(data),
      error: () => this.courses.set([])
    });

    this.students.branches().subscribe({
      next: data => this.branches.set(data),
      error: () => this.branches.set([])
    });

    this.run();
  }

  run(): void {
    this.loading.set(true);

    this.enquiries.report({
      fromDate: this.toIsoDate(this.fromDate()),
      toDate: this.toIsoDate(this.toDate()),
      status: this.status(),
      courseId: this.courseId(),
      branchId: this.branchId(),
      dueOnly: this.dueOnly()
    }).subscribe({
      next: data => {
        this.report.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  /** Shows only the enquiries nobody has got back to. */
  showDueOnly(): void {
    this.dueOnly.set(true);
    this.status.set(null);
    this.run();
  }

  reset(): void {
    const now = new Date();
    this.fromDate.set(new Date(now.getFullYear(), now.getMonth(), 1));
    this.toDate.set(now);
    this.status.set(null);
    this.courseId.set(null);
    this.branchId.set(null);
    this.dueOnly.set(false);
    this.run();
  }

  print(): void {
    window.print();
  }

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

  /** Conversion for one course row, as a whole number. */
  courseRate(enquiries: number, converted: number): number {
    return enquiries === 0 ? 0 : Math.round((converted / enquiries) * 100);
  }

  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }
}
