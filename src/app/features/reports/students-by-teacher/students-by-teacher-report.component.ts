import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { StudentsByTeacherReport } from '../../../core/models/report.model';
import { TeacherLookup } from '../../../core/models/student.model';
import { AuthService } from '../../../core/services/auth.service';
import { ReportService } from '../../../core/services/report.service';
import { StudentService } from '../../../core/services/student.service';
import { downloadCsv, reportFileName } from '../report-utils';

/**
 * Every student assigned to one teacher, in any of their three teacher slots.
 * Replaces `Views/StudentTecacherReport/Index.cshtml`.
 *
 * Office staff pick any teacher, same as the teacher-earnings report right next to
 * this one. A signed-in teacher is pinned to their own id instead — the picker is
 * hidden and the list loads straight away, as "My students" on their own dashboard.
 * The server enforces the same rule regardless of what this component sends.
 */
@Component({
  selector: 'app-students-by-teacher-report',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToggleSwitchModule
  ],
  templateUrl: './students-by-teacher-report.component.html',
  styleUrl: './students-by-teacher-report.component.scss'
})
export class StudentsByTeacherReportComponent {
  private readonly reports = inject(ReportService);
  private readonly students = inject(StudentService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly report = signal<StudentsByTeacherReport | null>(null);
  readonly loading = signal(false);
  readonly teachers = signal<TeacherLookup[]>([]);

  readonly teacherId = signal<number | null>(null);
  readonly activeOnly = signal(true);
  readonly search = signal('');

  readonly page = signal(1);
  readonly pageSize = signal(25);

  readonly isStaff = computed(() => this.auth.hasAnyRole(['Admin', 'Editor', 'Receptionist']));

  constructor() {
    if (this.isStaff()) {
      this.students.teachers().subscribe(list => this.teachers.set(list));
    } else {
      this.reports.myTeacherId().subscribe({
        next: id => {
          this.teacherId.set(id);
          this.run();
        }
      });
    }
  }

  run(resetPage = true): void {
    const teacherId = this.teacherId();

    if (!teacherId) {
      this.messages.add({
        severity: 'warn',
        summary: 'Choose a teacher',
        detail: 'Pick the teacher whose students you want to list.',
        life: 5000
      });
      return;
    }

    if (resetPage) this.page.set(1);
    this.loading.set(true);

    this.reports
      .studentsByTeacher(
        teacherId,
        this.page(),
        this.pageSize(),
        this.activeOnly(),
        this.search().trim() || null
      )
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

    if (this.report()) this.run(false);
  }

  /** Human column names, unlike the legacy export's raw `Stuname`/`NoTech` headers. */
  exportCsv(): void {
    const report = this.report();
    if (!report) return;

    this.reports
      .studentsByTeacher(
        report.teacherId,
        1,
        Math.max(report.studentCount, 1),
        this.activeOnly(),
        this.search().trim() || null
      )
      .subscribe(full => {
        downloadCsv(
          reportFileName(`students-of-teacher-${report.teacherId}`),
          [
            'Registration id', 'Student name', "Guardian's name", 'Address', 'Phone', 'Email',
            'Date of birth', 'Date of joining', 'Course', 'Course months', 'Monthly fees',
            'Teacher 1', 'Teacher 1 phone', 'Teacher 2', 'Teacher 2 phone',
            'Teacher 3', 'Teacher 3 phone', 'Status'
          ],
          full.rows.items.map(r => [
            r.registrationId, r.studentName, r.guardianName, r.address, r.phone, r.email,
            r.dateOfBirth, r.dateOfJoining, r.courseName, r.courseDuration, r.monthlyFees,
            r.teacher1Name, r.teacher1Phone, r.teacher2Name, r.teacher2Phone,
            r.teacher3Name, r.teacher3Phone,
            r.isComplete ? 'Complete' : r.isActive ? 'Active' : 'Inactive'
          ])
        );
      });
  }
}
