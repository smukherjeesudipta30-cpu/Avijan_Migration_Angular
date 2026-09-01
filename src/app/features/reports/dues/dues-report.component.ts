import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { DuesReport } from '../../../core/models/report.model';
import { CourseLookup } from '../../../core/models/student.model';
import { BranchListItem } from '../../../core/models/master.model';
import { MasterService } from '../../../core/services/master.service';
import { ReportService } from '../../../core/services/report.service';
import { StudentService } from '../../../core/services/student.service';
import { downloadCsv, reportFileName, startOfMonth, toIsoDate } from '../report-utils';

/**
 * Students on a course who did not pay in the range. Replaces
 * `Views/StudentReport/NotPaidIndex.cshtml` + `usp_NotPaidData`.
 */
@Component({
  selector: 'app-dues-report',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    TableModule,
    TagModule,
    ToggleSwitchModule
  ],
  templateUrl: './dues-report.component.html',
  styleUrl: './dues-report.component.scss'
})
export class DuesReportComponent {
  private readonly reports = inject(ReportService);
  private readonly masters = inject(MasterService);
  private readonly students = inject(StudentService);
  private readonly messages = inject(MessageService);

  readonly report = signal<DuesReport | null>(null);
  readonly loading = signal(false);

  /** Optional branch filter. Null is every branch. */
  readonly branch = signal<string | null>(null);
  readonly branches = signal<BranchListItem[]>([]);
  readonly courses = signal<CourseLookup[]>([]);

  readonly from = signal<Date>(startOfMonth());
  readonly to = signal<Date>(new Date());
  readonly courseId = signal<number | null>(null);

  /** Off reproduces the legacy row set exactly. */
  readonly includeNeverPaid = signal(true);

  readonly page = signal(1);
  readonly pageSize = signal(25);

  constructor() {
    this.masters.branches().subscribe({
      next: rows => this.branches.set(rows.filter(b => b.isActive))
    });

    this.students.courses().subscribe(list => this.courses.set(list));
  }

  run(resetPage = true): void {
    const courseId = this.courseId();

    if (!courseId) {
      this.messages.add({
        severity: 'warn',
        summary: 'Choose a course',
        detail: 'This report runs one course at a time, as it always has.',
        life: 5000
      });
      return;
    }

    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());

    if (!from || !to) return;

    if (resetPage) this.page.set(1);
    this.loading.set(true);

    this.reports
      .dues(courseId, from, to, this.page(), this.pageSize(), this.includeNeverPaid(), this.branch())
      .subscribe({
        next: report => {
          this.report.set(report);
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

    // Nothing to page until the first run has chosen a course.
    if (this.report()) this.run(false);
  }

  exportCsv(): void {
    const report = this.report();
    if (!report) return;

    this.reports
      .dues(
        report.courseId,
        toIsoDate(this.from())!,
        toIsoDate(this.to())!,
        1,
        Math.max(report.studentCount, 1),
        this.includeNeverPaid(),
        this.branch()
      )
      .subscribe(full => {
        downloadCsv(
          reportFileName('dues'),
          [
            'Registration id', 'Student name', 'Phone', 'Date of joining', 'Course',
            'Last payment', 'Months due', 'Monthly fee', 'Monthly fees due',
            'Late fine', 'Carried due', 'Outstanding due', 'Has ever paid'
          ],
          /* The same breakdown the table shows. A spreadsheet of one total per
             student cannot be checked or chased from; the parts are what makes it
             workable. */
          full.rows.items.map(r => [
            r.registrationId, r.studentName, r.phone, r.dateOfJoining, r.courseName,
            r.lastPaymentDate ?? '', r.monthsUnpaid, r.monthlyFee,
            r.monthsUnpaid * r.monthlyFee, r.lateFine, r.carriedDue,
            r.outstandingDue, r.hasEverPaid ? 'Yes' : 'No'
          ])
        );
      });
  }
}
