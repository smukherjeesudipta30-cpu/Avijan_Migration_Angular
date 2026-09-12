import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';
import { FormsModule } from '@angular/forms';

import { ApiResponse } from '../../../core/models/api-response.model';
import { ExamResult, ExamSitting } from '../../../core/models/exam.model';
import { ExamService } from '../../../core/services/exam.service';

/**
 * Sitting a theory paper.
 *
 * The clock on screen is a courtesy: the deadline that counts is the server's,
 * stamped on the attempt when it was opened. Closing the browser and coming back
 * resumes the same attempt with the same deadline — it does not restart the
 * clock — and running the clock out submits whatever has been answered.
 */
@Component({
  selector: 'app-exam-sitting',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    InputTextModule,
    RadioButtonModule
  ],
  providers: [ConfirmationService],
  templateUrl: './exam-sitting.component.html',
  styleUrl: './exam-sitting.component.scss'
})
export class ExamSittingComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly exams = inject(ExamService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly sitting = signal<ExamSitting | null>(null);
  readonly result = signal<ExamResult | null>(null);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly startError = signal<string | null>(null);

  /**
   * The paper does not open on the sign-in alone: the invigilator reads out six
   * digits at the desk and they are typed here. So the page starts on the code,
   * not on the questions.
   */
  readonly accessCode = signal('');
  readonly opening = signal(false);

  readonly codeValid = computed(() => /^[0-9]{6}$/.test(this.accessCode().trim()));

  private examId = 0;

  /** Question id to the option picked. */
  readonly answers = signal<Record<number, string>>({});

  readonly secondsLeft = signal(0);

  readonly answeredCount = computed(() => Object.keys(this.answers()).length);

  readonly questionCount = computed(() => this.sitting()?.questions.length ?? 0);

  readonly allAnswered = computed(
    () => this.questionCount() > 0 && this.answeredCount() === this.questionCount());

  readonly clock = computed(() => {
    const total = Math.max(0, this.secondsLeft());
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n: number) => `${n}`.padStart(2, '0');

    return hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;
  });

  /** The last five minutes, when the clock turns red. */
  readonly clockUrgent = computed(() => this.secondsLeft() <= 300);

  private timer: ReturnType<typeof setInterval> | null = null;
  private autoSubmitted = false;

  /* Answers are saved to the server a moment after each change. The server marks
     that copy if the paper comes in after time is up, so this is what stands
     between a dropped connection and a lost paper. Debounced because a student
     changing their mind three times in a second should be one save, not three. */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SaveDelayMs = 1500;

  /** Guards the tab close while a paper is open. */
  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.sitting() && !this.result()) event.preventDefault();
  };

  constructor() {
    this.examId = Number(this.route.snapshot.paramMap.get('examId'));

    if (!this.examId) {
      this.startError.set('That exam link is not valid.');
    }

    window.addEventListener('beforeunload', this.beforeUnload);
  }

  ngOnDestroy(): void {
    this.stopTimer();

    if (this.saveTimer !== null) clearTimeout(this.saveTimer);

    window.removeEventListener('beforeunload', this.beforeUnload);
  }

  /* -------------------------------------------------------------- start */

  /** Called from the code panel. Nothing loads until the six digits check out. */
  open(): void {
    if (!this.codeValid() || this.opening()) return;

    this.startError.set(null);
    this.opening.set(true);
    this.loading.set(true);

    this.exams.start(this.examId, this.accessCode().trim()).subscribe({
      next: response => {
        const sitting = response.data;

        this.opening.set(false);
        this.sitting.set(sitting);
        this.loading.set(false);

        // Resuming brings back whatever was already picked.
        const resumed: Record<number, string> = {};
        for (const q of sitting.questions) {
          if (q.selectedOption) resumed[q.questionId] = q.selectedOption;
        }
        this.answers.set(resumed);

        this.secondsLeft.set(sitting.secondsRemaining);
        this.startTimer();
      },
      error: (error: unknown) => {
        this.opening.set(false);
        this.loading.set(false);

        const message = error instanceof HttpErrorResponse
          ? (error.error as ApiResponse<unknown> | null)?.message
          : null;

        // Shown beside the code box rather than only as a toast — a wrong digit
        // is the likeliest reason to be here, and the fix is right there.
        this.startError.set(message ?? 'This exam could not be opened.');
      }
    });
  }

  private startTimer(): void {
    this.stopTimer();

    this.timer = setInterval(() => {
      const left = this.secondsLeft() - 1;
      this.secondsLeft.set(left);

      if (left <= 0 && !this.autoSubmitted) {
        this.autoSubmitted = true;
        this.stopTimer();
        this.send(true);
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /* ------------------------------------------------------------ answers */
  choose(questionId: number, option: string): void {
    this.answers.update(current => ({ ...current, [questionId]: option }));
    this.queueSave();
  }

  clearAnswer(questionId: number): void {
    this.answers.update(current => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });

    this.queueSave();
  }

  /**
   * Saves shortly after the student stops changing their mind. A failed save is
   * deliberately silent: it is a safety net, not the submission, and a toast every
   * time the college wifi hiccups would only alarm someone sitting an exam.
   */
  private queueSave(): void {
    const sitting = this.sitting();
    if (!sitting || this.result()) return;

    if (this.saveTimer !== null) clearTimeout(this.saveTimer);

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;

      this.exams.saveProgress(sitting.attemptId, this.answers()).subscribe({
        error: () => { /* the next change tries again */ }
      });
    }, ExamSittingComponent.SaveDelayMs);
  }

  isChosen(questionId: number, option: string): boolean {
    return this.answers()[questionId] === option;
  }

  isAnswered(questionId: number): boolean {
    return this.answers()[questionId] !== undefined;
  }

  scrollTo(questionNo: number): void {
    document.getElementById(`q-${questionNo}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ----------------------------------------------------------- submit */
  submit(): void {
    const unanswered = this.questionCount() - this.answeredCount();

    this.confirm.confirm({
      header: 'Submit your paper',
      message: unanswered > 0
        ? `You have left ${unanswered} question(s) unanswered. Once submitted the ` +
          'paper cannot be reopened. Submit anyway?'
        : 'Once submitted the paper cannot be reopened. Submit now?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Submit',
      rejectLabel: 'Keep working',
      accept: () => this.send(false)
    });
  }

  private send(auto: boolean): void {
    const sitting = this.sitting();
    if (!sitting || this.submitting() || this.result()) return;

    this.submitting.set(true);

    this.exams.submit({ attemptId: sitting.attemptId, answers: this.answers() }).subscribe({
      next: response => {
        this.submitting.set(false);
        this.stopTimer();
        this.result.set(response.data);

        this.messages.add({
          severity: auto ? 'warn' : 'success',
          summary: auto ? 'Time up — paper submitted' : 'Paper submitted',
          detail: `You scored ${response.data.score} of ${response.data.totalMarks}.`,
          life: 8000
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      // errorInterceptor already raises the toast carrying the server's message.
      error: () => this.submitting.set(false)
    });
  }

  back(): void {
    this.router.navigate(['/my-exams']);
  }
}
