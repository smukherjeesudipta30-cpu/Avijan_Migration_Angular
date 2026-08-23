import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';

import { TeacherEarningsReport } from '../../../core/models/report.model';
import { TeacherLookup } from '../../../core/models/student.model';
import { AuthService } from '../../../core/services/auth.service';
import { ReportService } from '../../../core/services/report.service';
import { StudentService } from '../../../core/services/student.service';
import { downloadCsv, reportFileName, startOfMonth, toIsoDate } from '../report-utils';

/**
 * One teacher's account: what they earned from student fees against what has
 * actually been paid to them. Replaces `Views/TeacherReport/Index.cshtml`,
 * which stitched `Income/TeacPaid` and `TeacherExpense/TeacPaid` together in
 * the browser and subtracted the two running totals in the template.
 */
@Component({
  selector: 'app-teacher-earnings-report',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    TableModule
  ],
  templateUrl: './teacher-earnings-report.component.html',
  styleUrl: './teacher-earnings-report.component.scss'
})
export class TeacherEarningsReportComponent {
  private readonly reports = inject(ReportService);
  private readonly students = inject(StudentService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly report = signal<TeacherEarningsReport | null>(null);
  readonly loading = signal(false);
  readonly teachers = signal<TeacherLookup[]>([]);

  readonly from = signal<Date>(startOfMonth());
  readonly to = signal<Date>(new Date());
  readonly teacherId = signal<number | null>(null);

  /**
   * Office staff pick any teacher; a signed-in teacher is pinned to their own
   * record, so the picker is hidden and the report loads straight away. The
   * server enforces the same rule regardless of what this component sends.
   */
  readonly isStaff = computed(() => this.auth.hasAnyRole(['Admin', 'Editor']));

  constructor() {
    if (this.isStaff()) {
      this.students.teachers().subscribe(list => this.teachers.set(list));
    } else {
      // The teacher's own id comes from their sign-in, the way the legacy page
      // resolved it from Session["UserID"].
      this.reports.myTeacherId().subscribe({
        next: id => {
          this.teacherId.set(id);
          this.run();
        }
      });
    }
  }

  run(): void {
    const teacherId = this.teacherId();

    if (!teacherId) {
      this.messages.add({
        severity: 'warn',
        summary: 'Choose a teacher',
        detail: 'This report covers one teacher at a time.',
        life: 5000
      });
      return;
    }

    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());

    if (!from || !to) return;

    this.loading.set(true);

    this.reports.teacherEarnings(teacherId, from, to).subscribe({
      next: report => {
        this.report.set(report);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  exportCsv(): void {
    const r = this.report();
    if (!r) return;

    // Both halves of the account go into one file, tagged by kind, so the
    // exported total reconciles with what is on screen.
    const rows: unknown[][] = [
      ...r.earnings.map(e => ['Earned', e.paidOn, e.studentName, e.registrationId, e.courseName, e.salary]),
      ...r.payments.map(p => ['Paid out', p.paidOn, '', '', '', -p.amount])
    ];

    downloadCsv(
      reportFileName(`teacher-${r.teacherId}-account`),
      ['Kind', 'Date', 'Student', 'Registration id', 'Course', 'Amount'],
      rows
    );
  }
}
