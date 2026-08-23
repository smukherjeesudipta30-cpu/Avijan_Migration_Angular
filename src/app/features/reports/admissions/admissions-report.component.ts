import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';

import { CourseLookup } from '../../../core/models/student.model';
import { AdmissionsReport } from '../../../core/models/report.model';
import { ReportService } from '../../../core/services/report.service';
import { StudentService } from '../../../core/services/student.service';
import { downloadCsv, reportFileName, startOfMonth, toIsoDate } from '../report-utils';

/**
 * New admissions between two dates. Replaces
 * `Views/StudentReport/MonthlyIndex.cshtml` + the `GetAllStuDetails` half of
 * `Scripts/APIStudent.js`.
 */
@Component({
  selector: 'app-admissions-report',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    TableModule
  ],
  templateUrl: './admissions-report.component.html',
  styleUrl: './admissions-report.component.scss'
})
export class AdmissionsReportComponent {
  private readonly reports = inject(ReportService);
  private readonly students = inject(StudentService);

  readonly report = signal<AdmissionsReport | null>(null);
  readonly loading = signal(false);
  readonly courses = signal<CourseLookup[]>([]);

  readonly from = signal<Date>(startOfMonth());
  readonly to = signal<Date>(new Date());
  readonly courseId = signal<number | null>(null);

  readonly page = signal(1);
  readonly pageSize = signal(25);

  constructor() {
    this.students.courses().subscribe(list => this.courses.set(list));
    this.run();
  }

  run(resetPage = true): void {
    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());

    if (!from || !to) return;

    if (resetPage) this.page.set(1);
    this.loading.set(true);

    this.reports
      .admissions(from, to, this.page(), this.pageSize(), this.courseId())
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
    this.run(false);
  }

  /**
   * Exports the whole range, not just the page on screen — the legacy grid had no
   * export at all and its on-screen total only covered rendered rows.
   */
  exportCsv(): void {
    const report = this.report();
    if (!report) return;

    const from = toIsoDate(this.from())!;
    const to = toIsoDate(this.to())!;

    this.reports
      .admissions(from, to, 1, Math.max(report.studentCount, 1), this.courseId())
      .subscribe(full => {
        downloadCsv(
          reportFileName('admissions'),
          ['Registration id', 'Student name', 'Phone', 'Date of joining', 'Course', 'Admission fees'],
          full.rows.items.map(r => [
            r.registrationId, r.studentName, r.phone, r.dateOfJoining, r.courseName, r.admissionFees
          ])
        );
      });
  }
}
