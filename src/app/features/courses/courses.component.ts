import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, debounceTime, distinctUntilChanged } from 'rxjs';

import { CourseListItem, CourseProgress, CourseSaveRequest } from '../../core/models/academic.model';
import { ApiResponse } from '../../core/models/api-response.model';
import { AcademicService } from '../../core/services/academic.service';
import { AuthService } from '../../core/services/auth.service';
import { StudentService } from '../../core/services/student.service';

/**
 * Course master plus the duration report — the migration of
 * `Views/Course/Index.cshtml` and `Views/CourseDuration/Index.cshtml`.
 *
 * The legacy duration screen had three separate actions (`AllCourses`,
 * `CoursesByCid`, `CoursesByCidAndStuRegId`); they are one filtered query here.
 */
@Component({
  selector: 'app-courses',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    InputNumberModule,
    InputTextModule,
    ProgressBarModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './courses.component.html',
  styleUrl: './courses.component.scss'
})
export class CoursesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly academics = inject(AcademicService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);
  private readonly students = inject(StudentService);

  readonly rows = signal<CourseListItem[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);
  readonly nameTaken = signal(false);

  readonly search = signal('');

  /**
   * Whether the course master is available at all. The legacy `Course/Index` was
   * `Admin,Editor`, while only the *filtered* duration report admitted a
   * Receptionist — so a Receptionist gets the progress panel and nothing else.
   */
  readonly canManageCourses = computed(() => this.auth.hasAnyRole(['Admin', 'Editor']));

  /** Which panel is showing: the master list or the progress report. */
  readonly view = signal<'list' | 'progress'>(
    this.auth.hasAnyRole(['Admin', 'Editor']) ? 'list' : 'progress');

  /* ---------------------------------------------------------- progress */
  readonly progress = signal<CourseProgress[]>([]);
  readonly progressTotal = signal(0);
  readonly progressLoading = signal(false);
  readonly progressCourseId = signal<number | null>(null);
  readonly progressReg = signal('');
  readonly progressPage = signal(1);
  readonly progressPageSize = signal(25);

  /**
   * Courses as dropdown options for the progress filter. Staff get them from the
   * master list they already loaded; a Receptionist cannot read that list, so
   * theirs come from the lookup endpoint instead.
   */
  private readonly lookupOptions = signal<{ label: string; value: number }[]>([]);

  readonly courseOptions = computed(() =>
    this.canManageCourses()
      ? this.rows().map(c => ({ label: c.name ?? '(unnamed)', value: c.courseId }))
      : this.lookupOptions());

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(300)]],
    duration: [null as number | null, [Validators.required, Validators.min(1), Validators.max(120)]]
  });

  constructor() {
    if (this.canManageCourses()) {
      this.load();
    } else {
      // Reading the course master is Admin/Editor only, so a Receptionist takes
      // just the names they need for the filter.
      this.students.courses().subscribe(list =>
        this.lookupOptions.set(list.map(c => ({ label: c.name, value: c.courseId }))));
    }

    this.form.controls.name.valueChanges
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(name => {
        if (!name || this.form.controls.name.invalid) {
          this.nameTaken.set(false);
          return;
        }

        this.academics.courseNameExists(name, this.editingId()).subscribe({
          next: taken => this.nameTaken.set(taken),
          error: () => this.nameTaken.set(false)
        });
      });
  }

  /* -------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    // Loaded whole: there are 28 courses, and the progress filter needs them all.
    this.academics.courses(1, 200, this.search().trim() || null).subscribe({
      next: result => {
        this.rows.set(result.items);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  runSearch(): void {
    this.load();
  }

  /* -------------------------------------------------------------- form */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Course name and duration are both required.',
        life: 5000
      });
      return;
    }

    if (this.nameTaken()) {
      this.messages.add({
        severity: 'warn',
        summary: 'Course already exists',
        detail: 'Another course has that name.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);

    const v = this.form.getRawValue();
    const payload: CourseSaveRequest = { name: v.name.trim(), duration: v.duration };
    const id = this.editingId();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.academics.createCourse(payload)
      : this.academics.updateCourse(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Course added' : 'Course updated',
          detail: response.message ?? 'Saved.',
          life: 5000
        });
        this.resetForm();
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.showError(error);
      }
    });
  }

  edit(course: CourseListItem): void {
    this.editingId.set(course.courseId);
    this.nameTaken.set(false);
    this.view.set('list');

    this.form.patchValue({ name: course.name ?? '', duration: course.duration ?? null });

    document.getElementById('course-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    this.form.reset({ name: '', duration: null });
    this.editingId.set(null);
    this.nameTaken.set(false);
  }

  remove(course: CourseListItem): void {
    if (course.isReferenced) {
      this.messages.add({
        severity: 'warn',
        summary: 'Cannot delete',
        detail: `${course.totalStudents} student(s) are enrolled on ${course.name}. Move them first.`,
        life: 8000
      });
      return;
    }

    this.confirm.confirm({
      header: 'Delete course',
      message: `Delete ${course.name}? No students are enrolled, so it can be removed safely.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.academics.deleteCourse(course.courseId).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Deleted', life: 4000 });
            this.load();
          },
          error: (error: unknown) => this.showError(error)
        });
      }
    });
  }

  /* ---------------------------------------------------------- progress */
  showProgress(): void {
    this.view.set('progress');
    this.loadProgress();
  }

  loadProgress(): void {
    // Mirrors the server rule: only Admin/Editor may run this unfiltered, because
    // the legacy unfiltered listing (CourseDuration/Index) excluded Receptionists.
    if (!this.canManageCourses() && !this.progressCourseId() && !this.progressReg().trim()) {
      this.progress.set([]);
      this.progressTotal.set(0);
      this.messages.add({
        severity: 'info',
        summary: 'Choose a filter',
        detail: 'Select a course or enter a registration id to run this report.',
        life: 5000
      });
      return;
    }

    this.progressLoading.set(true);

    this.academics
      .courseProgress(
        this.progressPage(),
        this.progressPageSize(),
        this.progressCourseId(),
        this.progressReg().trim() || null)
      .subscribe({
        next: result => {
          this.progress.set(result.items);
          this.progressTotal.set(result.totalCount);
          this.progressLoading.set(false);
        },
        error: () => this.progressLoading.set(false)
      });
  }

  onProgressLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.progressPageSize();
    const first = event.first ?? 0;

    this.progressPageSize.set(size);
    this.progressPage.set(Math.floor(first / size) + 1);
    this.loadProgress();
  }

  applyProgressFilter(): void {
    this.progressPage.set(1);
    this.loadProgress();
  }

  clearProgressFilter(): void {
    this.progressCourseId.set(null);
    this.progressReg.set('');
    this.progressPage.set(1);
    this.loadProgress();
  }

  /** Colour the bar by how far behind the student is. */
  progressSeverity(row: CourseProgress): 'success' | 'info' | 'warn' {
    if (row.percentComplete >= 100) return 'success';
    return row.percentComplete >= 50 ? 'info' : 'warn';
  }

  private showError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as ApiResponse<unknown> | null;
      const detail = body?.errors?.length ? body.errors.join(' ') : body?.message;

      if (detail) {
        this.messages.add({ severity: 'error', summary: 'Could not save', detail, life: 9000 });
      }
    }
  }
}
