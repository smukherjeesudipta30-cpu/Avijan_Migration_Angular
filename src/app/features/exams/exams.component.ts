import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { CourseListItem } from '../../core/models/academic.model';
import { ApiResponse } from '../../core/models/api-response.model';
import {
  ExamAnswerCopy,
  ExamAttemptReview,
  ExamPaper,
  ExamPaperSaveRequest,
  ExamQuestion,
  ExamScheduleRow,
  ExamUploadResult,
  PaperType,
  PracticalRosterRow
} from '../../core/models/exam.model';
import { AcademicService } from '../../core/services/academic.service';
import { AuthService } from '../../core/services/auth.service';
import { resizeImageToLimit } from '../../core/images/image-resize';
import { ExamService } from '../../core/services/exam.service';
import { ExamReviewDialogComponent } from '../../shared/exam-review/exam-review-dialog.component';

/**
 * The administrator's side of the examination portal: the papers, their question
 * sheets, and the practical marks that are examined in the room rather than sat
 * online.
 *
 * A course is examined any number of times; each examination is a term carrying
 * one theory paper (sat here, marked automatically) and one practical (entered
 * by the institute). Only theory papers hold questions.
 */
@Component({
  selector: 'app-exams',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    CheckboxModule,
    SelectModule,
    TableModule,
    TagModule,
    TooltipModule,
    ExamReviewDialogComponent
  ],
  providers: [ConfirmationService],
  templateUrl: './exams.component.html',
  styleUrl: './exams.component.scss'
})
export class ExamsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly exams = inject(ExamService);
  private readonly academic = inject(AcademicService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly rows = signal<ExamPaper[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly search = signal('');
  readonly courseFilter = signal<number | null>(null);

  readonly courses = signal<CourseListItem[]>([]);

  /** Only an administrator may delete a paper. */
  readonly canDelete = computed(() => this.auth.hasAnyRole(['Admin']));

  /**
   * A Receptionist reaches this page for one reason only: to put a Practical
   * date on a student once their Theory is done. Creating or editing a paper,
   * touching its question bank, publishing it or entering practical marks stays
   * with Admin/Editor, same as before Receptionist could open this page at all.
   */
  readonly canManagePapers = computed(() => this.auth.hasAnyRole(['Admin', 'Editor', 'Receptionist']));

  readonly paperTypes: { label: string; value: PaperType }[] = [
    { label: 'Theory (sat online)', value: 'Theory' },
    { label: 'Practical (marks entered here)', value: 'Practical' }
  ];

  readonly scheduleModes: { label: string; value: 'Online' | 'Offline' }[] = [
    { label: 'Online', value: 'Online' },
    { label: 'Offline', value: 'Offline' }
  ];

  /* ------------------------------------------------------ paper dialog */
  readonly paperDialog = signal(false);
  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(150)]],
    subject: ['', [Validators.maxLength(100)]],
    courseId: [null as number | null, [Validators.required]],
    paperType: ['Theory' as PaperType, [Validators.required]],
    termNumber: [1 as number | null, [Validators.required, Validators.min(1)]],
    totalMarks: [50 as number | null, [Validators.required, Validators.min(1)]],
    passMarks: [null as number | null],
    durationMinutes: [60 as number | null, [Validators.required, Validators.min(1)]],
    opensOn: [null as Date | null],
    closesOn: [null as Date | null]
  });

  /** A practical carries no questions and is never sat against a clock. */
  readonly isPractical = computed(() => this.form.controls.paperType.value === 'Practical');

  /* -------------------------------------------------- questions dialog */
  readonly questionDialog = signal(false);
  readonly questionPaper = signal<ExamPaper | null>(null);
  readonly questions = signal<ExamQuestion[]>([]);
  readonly questionsLoading = signal(false);
  readonly uploading = signal(false);
  readonly uploadResult = signal<ExamUploadResult | null>(null);

  /* --------------------------------------------------- schedule dialog */
  readonly scheduleDialog = signal(false);
  readonly schedulePaper = signal<ExamPaper | null>(null);
  readonly scheduleRows = signal<ExamScheduleRow[]>([]);
  readonly scheduleLoading = signal(false);
  readonly savingRow = signal<string | null>(null);

  /** Working date per student, keyed by registration id. */
  readonly rowDates = signal<Record<string, Date | null>>({});

  /** Working Online/Offline choice per student, keyed by registration id (theory only). */
  readonly rowModes = signal<Record<string, 'Online' | 'Offline'>>({});

  /** The batch date at the head of the dialog. */
  readonly batchDate = signal<Date | null>(null);
  readonly batchOverwrite = signal(false);
  readonly batchSaving = signal(false);

  /** The codes are the point of the sheet, so they are hidden until asked for. */
  readonly codesVisible = signal(false);

  /**
   * Narrows the sheet by registration id or name. Courses run to seventy-odd
   * students and names repeat, so scrolling for the right row is where the wrong
   * person gets scheduled — searching the registration id is exact.
   */
  readonly scheduleSearch = signal('');

  readonly visibleScheduleRows = computed(() => {
    const term = this.scheduleSearch().trim().toLowerCase();
    if (!term) return this.scheduleRows();

    return this.scheduleRows().filter(r =>
      r.registrationId.toLowerCase().includes(term)
      || (r.studentName ?? '').toLowerCase().includes(term)
      || (r.guardianName ?? '').toLowerCase().includes(term));
  });

  readonly scheduledCount = computed(
    () => this.scheduleRows().filter(r => r.scheduledOn).length);

  /** Flags a name shared by more than one student on this sheet. */
  readonly duplicateNames = computed(() => {
    const seen = new Map<string, number>();

    for (const row of this.scheduleRows()) {
      const name = (row.studentName ?? '').trim().toLowerCase();
      if (name) seen.set(name, (seen.get(name) ?? 0) + 1);
    }

    return new Set([...seen].filter(([, count]) => count > 1).map(([name]) => name));
  });

  isDuplicateName(row: ExamScheduleRow): boolean {
    return this.duplicateNames().has((row.studentName ?? '').trim().toLowerCase());
  }

  /* -------------------------------------------------- practical dialog */
  readonly practicalDialog = signal(false);
  readonly practicalPaper = signal<ExamPaper | null>(null);
  readonly roster = signal<PracticalRosterRow[]>([]);
  readonly rosterLoading = signal(false);
  readonly savingMark = signal<string | null>(null);

  /* online theory: the saved answer sheet */
  readonly reviewOpen = signal(false);
  readonly reviewLoading = signal(false);
  readonly review = signal<ExamAttemptReview | null>(null);

  /* offline theory: the uploaded answer script */
  readonly copiesOpen = signal(false);
  readonly copiesRow = signal<PracticalRosterRow | null>(null);
  readonly copies = signal<ExamAnswerCopy[]>([]);
  readonly copiesLoading = signal(false);
  readonly uploadingCopies = signal(false);

  constructor() {
    this.load();

    this.academic.courses(1, 500).subscribe({
      next: page => this.courses.set(page.items)
    });
  }

  /* ------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    this.exams
      .papers(this.page(), this.pageSize(), this.search().trim() || null, this.courseFilter())
      .subscribe({
        next: page => {
          this.rows.set(page.items);
          this.totalCount.set(page.totalCount);
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
    this.load();
  }

  applyFilter(): void {
    this.page.set(1);
    this.load();
  }

  clearFilter(): void {
    this.search.set('');
    this.courseFilter.set(null);
    this.applyFilter();
  }

  /* ------------------------------------------------------ paper dialog */
  newPaper(): void {
    this.editingId.set(null);
    this.form.reset({
      title: '',
      subject: '',
      courseId: null,
      paperType: 'Theory',
      termNumber: 1,
      totalMarks: 50,
      passMarks: null,
      durationMinutes: 60,
      opensOn: null,
      closesOn: null
    });
    this.paperDialog.set(true);
  }

  editPaper(paper: ExamPaper): void {
    this.editingId.set(paper.examId);

    this.form.reset({
      title: paper.title,
      subject: paper.subject ?? '',
      courseId: paper.courseId ?? null,
      paperType: paper.paperType,
      termNumber: paper.termNumber,
      totalMarks: paper.totalMarks,
      passMarks: paper.passMarks ?? null,
      durationMinutes: paper.durationMinutes,
      opensOn: paper.opensOn ? new Date(paper.opensOn) : null,
      closesOn: paper.closesOn ? new Date(paper.closesOn) : null
    });

    this.paperDialog.set(true);
  }

  savePaper(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Title, course, examination number, total marks and duration are all required.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);

    const v = this.form.getRawValue();

    const payload: ExamPaperSaveRequest = {
      title: v.title.trim(),
      subject: v.subject.trim() || null,
      courseId: v.courseId,
      paperType: v.paperType,
      termNumber: v.termNumber ?? 1,
      totalMarks: v.totalMarks ?? 0,
      passMarks: v.passMarks,
      durationMinutes: v.durationMinutes ?? 60,
      opensOn: this.toIso(v.opensOn),
      closesOn: this.toIso(v.closesOn)
    };

    const id = this.editingId();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.exams.createPaper(payload)
      : this.exams.updatePaper(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.paperDialog.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Paper created' : 'Paper updated',
          detail: response.message ?? 'Saved.',
          life: 5000
        });
        this.load();
      },
      // errorInterceptor already raises the toast carrying the server's message.
      error: () => this.saving.set(false)
    });
  }

  deletePaper(paper: ExamPaper): void {
    this.confirm.confirm({
      header: 'Delete exam paper',
      message:
        `Delete "${paper.title}" and its ${paper.questionCount} question(s)? ` +
        'This cannot be undone.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.exams.deletePaper(paper.examId).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Deleted', life: 4000 });
            this.load();
          }
        });
      }
    });
  }

  togglePublished(paper: ExamPaper): void {
    const next = !paper.isPublished;

    this.exams.setPublished(paper.examId, next).subscribe({
      next: response => {
        this.messages.add({
          severity: 'success',
          summary: next ? 'Published' : 'Withdrawn',
          detail: response.message ?? '',
          life: 5000
        });
        this.load();
      }
    });
  }

  /* -------------------------------------------------- questions dialog */
  openQuestions(paper: ExamPaper): void {
    this.questionPaper.set(paper);
    this.uploadResult.set(null);
    this.questions.set([]);
    this.questionDialog.set(true);
    this.questionsLoading.set(true);

    this.exams.questions(paper.examId).subscribe({
      next: rows => {
        this.questions.set(rows);
        this.questionsLoading.set(false);
      },
      error: () => this.questionsLoading.set(false)
    });
  }

  downloadTemplate(): void {
    this.exams.questionTemplate().subscribe({
      next: blob => this.saveBlob(blob, 'avijan-exam-questions-template.xlsx'),
      error: () =>
        this.messages.add({
          severity: 'error',
          summary: 'Could not download the template',
          life: 6000
        })
    });
  }

  onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const paper = this.questionPaper();

    if (!file || !paper) return;

    this.uploading.set(true);
    this.uploadResult.set(null);

    this.exams.uploadQuestions(paper.examId, file).subscribe({
      next: response => {
        this.uploading.set(false);
        input.value = '';
        this.uploadResult.set(response.data);

        this.messages.add({
          severity: 'success',
          summary: 'Questions uploaded',
          detail:
            `${response.data.questionsSaved} question(s) saved, ` +
            `${response.data.uploadedMarks} of ${response.data.paperTotalMarks} marks.`,
          life: 6000
        });

        this.openQuestions({ ...paper });
        this.load();
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        input.value = '';

        // The upload reports every bad row at once, so the sheet can be fixed in
        // one pass rather than one error at a time.
        if (error instanceof HttpErrorResponse) {
          const body = error.error as ApiResponse<ExamUploadResult> | null;
          if (body?.data) this.uploadResult.set(body.data);
        }
      }
    });
  }

  /* --------------------------------------------------- schedule dialog */

  /**
   * The sitting sheet. A student can neither download an admit card nor open the
   * paper until they appear here with a date, and a theory paper additionally
   * needs the six-digit code read out to them at the desk.
   */
  openSchedule(paper: ExamPaper): void {
    this.schedulePaper.set(paper);
    this.scheduleRows.set([]);
    this.rowDates.set({});
    this.batchDate.set(null);
    this.batchOverwrite.set(false);
    this.codesVisible.set(false);
    this.scheduleSearch.set('');
    this.scheduleDialog.set(true);
    this.loadSchedule();
  }

  private loadSchedule(): void {
    const paper = this.schedulePaper();
    if (!paper) return;

    this.scheduleLoading.set(true);

    this.exams.schedule(paper.examId).subscribe({
      next: rows => {
        this.scheduleRows.set(rows);

        const dates: Record<string, Date | null> = {};
        const modes: Record<string, 'Online' | 'Offline'> = {};
        for (const row of rows) {
          dates[row.registrationId] = row.scheduledOn ? new Date(row.scheduledOn) : null;
          modes[row.registrationId] = row.mode ?? 'Online';
        }
        this.rowDates.set(dates);
        this.rowModes.set(modes);

        this.scheduleLoading.set(false);
      },
      error: () => this.scheduleLoading.set(false)
    });
  }

  setRowDate(registrationId: string, value: Date | null): void {
    this.rowDates.update(current => ({ ...current, [registrationId]: value }));
  }

  setRowMode(registrationId: string, value: 'Online' | 'Offline'): void {
    this.rowModes.update(current => ({ ...current, [registrationId]: value }));
  }

  rowMode(registrationId: string): 'Online' | 'Offline' {
    return this.rowModes()[registrationId] ?? 'Online';
  }

  rowDate(registrationId: string): Date | null {
    return this.rowDates()[registrationId] ?? null;
  }

  saveRow(row: ExamScheduleRow): void {
    const paper = this.schedulePaper();
    const when = this.rowDate(row.registrationId);

    if (!paper) return;

    if (!when) {
      this.messages.add({
        severity: 'warn',
        summary: 'Set a date and time first',
        detail: `Nothing to save for ${this.who(row)}.`,
        life: 4000
      });
      return;
    }

    this.savingRow.set(row.registrationId);

    this.exams
      .saveSchedule({
        examId: paper.examId,
        registrationId: row.registrationId,
        scheduledOn: this.toIsoLocal(when),
        mode: paper.paperType === 'Theory' ? this.rowMode(row.registrationId) : 'Online'
      })
      .subscribe({
        next: response => {
          this.savingRow.set(null);
          this.messages.add({
            severity: 'success',
            summary: 'Sitting saved',
            detail: response.data.accessCode
              ? `${this.who(row)} — code ${response.data.accessCode}.`
              : `${this.who(row)} scheduled.`,
            life: 6000
          });
          this.loadSchedule();
        },
        error: () => this.savingRow.set(null)
      });
  }

  scheduleBatch(): void {
    const paper = this.schedulePaper();
    const when = this.batchDate();

    if (!paper || !when) {
      this.messages.add({
        severity: 'warn',
        summary: 'Pick a date and time',
        detail: 'Set when the batch sits the paper.',
        life: 4000
      });
      return;
    }

    const overwrite = this.batchOverwrite();

    this.confirm.confirm({
      header: 'Schedule the whole batch',
      message: overwrite
        ? 'Every student on this course will be moved to that date and time, including ' +
          'those already scheduled — admit cards already printed will be wrong. Continue?'
        : 'Every student on this course who is not already scheduled will be given that ' +
          'date and time, each with their own code. Continue?',
      icon: 'pi pi-calendar',
      acceptLabel: 'Schedule',
      rejectLabel: 'Cancel',
      accept: () => {
        this.batchSaving.set(true);

        this.exams
          .scheduleBatch({
            examId: paper.examId,
            scheduledOn: this.toIsoLocal(when),
            overwriteExisting: overwrite
          })
          .subscribe({
            next: response => {
              this.batchSaving.set(false);

              const r = response.data;
              const skipped: string[] = [];
              if (r.skippedAlreadyScheduled) skipped.push(`${r.skippedAlreadyScheduled} already scheduled`);
              if (r.skippedAlreadySat) skipped.push(`${r.skippedAlreadySat} already sat the paper`);

              this.messages.add({
                severity: 'success',
                summary: `${r.scheduled} student(s) scheduled`,
                detail: skipped.length ? `Left alone: ${skipped.join(', ')}.` : 'Each has their own code.',
                life: 8000
              });

              this.loadSchedule();
            },
            error: () => this.batchSaving.set(false)
          });
      }
    });
  }

  regenerateCode(row: ExamScheduleRow): void {
    const paper = this.schedulePaper();
    if (!paper) return;

    this.confirm.confirm({
      header: 'Issue a new code',
      message:
        `Replace the code for ${this.who(row)}? The one already ` +
        'given out stops working immediately.',
      icon: 'pi pi-refresh',
      acceptLabel: 'Issue new code',
      rejectLabel: 'Cancel',
      accept: () => {
        this.exams.regenerateCode(paper.examId, row.registrationId).subscribe({
          next: response => {
            this.codesVisible.set(true);
            this.messages.add({
              severity: 'success',
              summary: 'New code issued',
              detail: `${this.who(row)} — code ${response.data.accessCode}.`,
              life: 9000
            });
            this.loadSchedule();
          }
        });
      }
    });
  }

  removeSchedule(row: ExamScheduleRow): void {
    const paper = this.schedulePaper();
    if (!paper) return;

    this.confirm.confirm({
      header: 'Withdraw the sitting',
      message:
        `Withdraw ${this.who(row)} from this paper? Their admit ` +
        'card stops being available and their code stops working.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Withdraw',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.exams.removeSchedule(paper.examId, row.registrationId).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Withdrawn', life: 4000 });
            this.loadSchedule();
          }
        });
      }
    });
  }

  /* -------------------------------------------------- practical dialog */
  openPractical(paper: ExamPaper): void {
    this.practicalPaper.set(paper);
    this.roster.set([]);
    this.practicalDialog.set(true);
    this.rosterLoading.set(true);

    this.exams.practicalRoster(paper.examId).subscribe({
      next: rows => {
        this.roster.set(rows);
        this.rosterLoading.set(false);
      },
      error: () => this.rosterLoading.set(false)
    });
  }

  saveMark(row: PracticalRosterRow): void {
    const paper = this.practicalPaper();
    if (!paper) return;

    if (row.score === null || row.score === undefined) {
      this.messages.add({
        severity: 'warn',
        summary: 'Enter a mark first',
        detail: `Nothing to save for ${this.who(row)}.`,
        life: 4000
      });
      return;
    }

    this.savingMark.set(row.registrationId);

    this.exams
      .savePracticalMark({
        examId: paper.examId,
        registrationId: row.registrationId,
        score: row.score
      })
      .subscribe({
        next: () => {
          this.savingMark.set(null);
          this.messages.add({
            severity: 'success',
            summary: 'Mark saved',
            detail: `${this.who(row)}: ${row.score} / ${row.totalMarks}.`,
            life: 4000
          });

          // Reload so the entered-on stamp and the paper's attempt count follow.
          this.openPractical(paper);
          this.load();
        },
        error: () => this.savingMark.set(null)
      });
  }

  /* ------------------------------------- online theory: answer sheet */

  /** A student's submitted online paper, read-only, with the correct options. */
  openReview(row: PracticalRosterRow): void {
    if (!row.attemptId) return;

    this.review.set(null);
    this.reviewLoading.set(true);
    this.reviewOpen.set(true);

    this.exams.attemptReview(row.attemptId).subscribe({
      next: r => {
        this.review.set(r);
        this.reviewLoading.set(false);
      },
      error: () => {
        this.reviewLoading.set(false);
        this.reviewOpen.set(false);
      }
    });
  }

  /* --------------------------------- offline theory: answer script copy */

  /** Largest photo kept after shrinking on the device - 3 MB is the server's cap. */
  private static readonly MaxCopyImageBytes = 1_500_000;

  openCopies(row: PracticalRosterRow): void {
    const paper = this.practicalPaper();
    if (!paper) return;

    this.copiesRow.set(row);
    this.copies.set([]);
    this.copiesOpen.set(true);
    this.copiesLoading.set(true);

    this.exams.answerCopies(paper.examId, row.registrationId).subscribe({
      next: copies => {
        this.copies.set(copies);
        this.copiesLoading.set(false);
      },
      error: () => this.copiesLoading.set(false)
    });
  }

  async uploadCopies(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';

    const paper = this.practicalPaper();
    const row = this.copiesRow();
    if (!paper || !row || picked.length === 0) return;

    this.uploadingCopies.set(true);

    // Phone photos are several MB each; shrink them here so an upload over a
    // slow connection is quick and the database stays lean. PDFs go as they are.
    const files = await Promise.all(picked.map(f =>
      f.type.startsWith('image/')
        ? resizeImageToLimit(f, ExamsComponent.MaxCopyImageBytes, 2000)
        : Promise.resolve(f)));

    this.exams.uploadAnswerCopies(paper.examId, row.registrationId, files).subscribe({
      next: copies => {
        this.uploadingCopies.set(false);
        this.copies.set(copies);
        this.setCopyCount(row.registrationId, copies.length);
        this.messages.add({
          severity: 'success',
          summary: 'Answer copy uploaded',
          detail: `${this.who(row)}: ${copies.length} file(s) on record. The mark can now be saved.`,
          life: 5000
        });
      },
      error: () => this.uploadingCopies.set(false)
    });
  }

  viewCopy(copy: ExamAnswerCopy): void {
    // Opened synchronously so the popup is not blocked, then filled once loaded.
    const win = window.open('', '_blank');

    this.exams.answerCopyFile(copy.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        if (win) {
          win.location.href = url;
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = copy.fileName;
          a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => win?.close()
    });
  }

  removeCopy(copy: ExamAnswerCopy): void {
    const row = this.copiesRow();
    if (!row) return;

    this.confirm.confirm({
      header: 'Remove this page?',
      message: `Remove "${copy.fileName}" from ${this.who(row)}'s answer copy?`,
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () =>
        this.exams.deleteAnswerCopy(copy.id).subscribe({
          next: () => {
            const left = this.copies().filter(c => c.id !== copy.id);
            this.copies.set(left);
            this.setCopyCount(row.registrationId, left.length);
          }
        })
    });
  }

  private setCopyCount(registrationId: string, count: number): void {
    this.roster.update(rows =>
      rows.map(r => (r.registrationId === registrationId ? { ...r, answerCopyCount: count } : r)));
  }

  /* ------------------------------------------------------------ helpers */

  /**
   * Names a student for a message: always the name AND the registration id.
   *
   * Never the name alone. Students share names — the register holds four
   * "NABAMITA DAS" — so a confirmation reading only the name cannot tell an
   * administrator which of them they are about to schedule, recode or withdraw.
   * The registration id is the only thing that identifies one person.
   */
  who(row: { studentName?: string; registrationId: string }): string {
    return row.studentName
      ? `${row.studentName} (${row.registrationId})`
      : row.registrationId;
  }

  courseName(courseId?: number | null): string {
    if (!courseId) return '—';
    return this.courses().find(c => c.courseId === courseId)?.name ?? `#${courseId}`;
  }

  /** A theory paper only balances when its questions add up to the paper total. */
  marksBalance(paper: ExamPaper): boolean {
    return paper.paperType === 'Practical' || paper.uploadedMarks === paper.totalMarks;
  }

  /**
   * A Practical date is not this row's to set until the student has submitted
   * Theory for the same course and term — enforced again on the server, this is
   * what stops the office from filling in a date the save would only reject.
   */
  practicalBlocked(paper: ExamPaper, row: ExamScheduleRow): boolean {
    return paper.paperType === 'Practical' && !row.theorySubmittedOn;
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  private toIso(date: Date | null): string | null {
    return date ? this.toIsoLocal(date) : null;
  }

  /**
   * Sends the wall-clock time the administrator typed, with no timezone suffix.
   *
   * `toISOString` would convert to UTC, and the server compares against
   * `DateTime.Now` — so a 10:00 sitting would be stored as 04:30 and the paper
   * would open five and a half hours early.
   */
  private toIsoLocal(date: Date): string {
    const pad = (n: number) => `${n}`.padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
  }
}
