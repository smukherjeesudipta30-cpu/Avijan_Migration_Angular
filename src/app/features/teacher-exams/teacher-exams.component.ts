import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { CourseLookup, TeacherLookup } from '../../core/models/student.model';
import {
  TeacherExamAssignment,
  TeacherExamScheduleItem
} from '../../core/models/teacher-exam.model';
import { StudentService } from '../../core/services/student.service';
import { TeacherExamService } from '../../core/services/teacher-exam.service';

/**
 * Admin's side of the teacher competency exam portal: assign a teacher to a
 * course, schedule a sitting, and let AI generate that sitting's questions.
 * Courses come from the existing Course master — nothing to type here beyond
 * picking who and what, and when.
 */
@Component({
  selector: 'app-teacher-exams',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputNumberModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule
  ],
  templateUrl: './teacher-exams.component.html',
  styleUrl: './teacher-exams.component.scss'
})
export class TeacherExamsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly students = inject(StudentService);
  private readonly exams = inject(TeacherExamService);
  private readonly messages = inject(MessageService);

  readonly teachers = signal<TeacherLookup[]>([]);
  readonly courses = signal<CourseLookup[]>([]);
  readonly assignments = signal<TeacherExamAssignment[]>([]);
  readonly schedules = signal<TeacherExamScheduleItem[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly dueCount = computed(() => this.assignments().filter(a => a.isActive && a.needsScheduling).length);

  readonly form = this.fb.nonNullable.group({
    teacherId: [0, [Validators.required, Validators.min(1)]],
    courseId: [0, [Validators.required, Validators.min(1)]]
  });

  /* ------------------------------------------------------------ schedule dialog */
  readonly scheduleVisible = signal(false);
  readonly scheduleFor = signal<TeacherExamAssignment | null>(null);
  readonly scheduleOn = signal<Date | null>(null);
  readonly questionCount = signal(10);
  readonly scheduling = signal(false);

  ngOnInit(): void {
    this.students.teachers().subscribe({ next: rows => this.teachers.set(rows.filter(t => !t.isPlaceholder)) });
    this.students.courses().subscribe({ next: rows => this.courses.set(rows) });
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.exams.assignments().subscribe({
      next: rows => {
        this.assignments.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });

    this.exams.schedules().subscribe({ next: rows => this.schedules.set(rows) });
  }

  teacherName(id: number): string {
    return this.teachers().find(t => t.teacherId === id)?.name ?? `#${id}`;
  }

  courseName(id: number): string {
    return this.courses().find(c => c.courseId === id)?.name ?? `#${id}`;
  }

  assign(): void {
    if (this.form.invalid || this.saving()) return;

    this.saving.set(true);
    const { teacherId, courseId } = this.form.getRawValue();

    this.exams.createAssignment({ teacherId, courseId }).subscribe({
      next: () => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: 'Assigned', life: 4000 });
        this.form.reset({ teacherId: 0, courseId: 0 });
        this.load();
      },
      error: () => this.saving.set(false)
    });
  }

  setActive(assignment: TeacherExamAssignment, isActive: boolean): void {
    this.exams.setAssignmentActive(assignment.id, isActive).subscribe({
      next: () => this.load()
    });
  }

  openSchedule(assignment: TeacherExamAssignment): void {
    this.scheduleFor.set(assignment);
    this.scheduleOn.set(new Date());
    this.questionCount.set(10);
    this.scheduleVisible.set(true);
  }

  confirmSchedule(): void {
    const assignment = this.scheduleFor();
    const on = this.scheduleOn();
    if (!assignment || !on || this.scheduling()) return;

    this.scheduling.set(true);

    this.exams.schedule({
      teacherExamAssignmentId: assignment.id,
      scheduledOn: on.toISOString(),
      questionCount: this.questionCount()
    }).subscribe({
      next: () => {
        this.scheduling.set(false);
        this.scheduleVisible.set(false);
        this.messages.add({
          severity: 'success',
          summary: 'Exam scheduled',
          detail: `${assignment.teacherName}'s ${assignment.courseName} sitting is set.`,
          life: 6000
        });
        this.load();
      },
      error: () => this.scheduling.set(false)
    });
  }

  pct(value: number | undefined | null): string {
    return `${(value ?? 0).toFixed(2)}%`;
  }
}
