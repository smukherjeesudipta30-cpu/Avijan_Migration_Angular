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
 *
 * The paper also runs full screen. Leaving it — exiting full screen, switching
 * tabs, minimising — is reported to the server and counted against the attempt
 * (not just shown as a warning here, so a reload cannot reset the count); three
 * strikes and the paper is auto-submitted with whatever was answered so far.
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

  /* ------------------------------------------------------------ proctoring
     The strike limit itself lives only on the server (ExamService.cs) — it
     enforces it and tells the client the count and limit on every report. */
  readonly violationCount = signal(0);
  readonly violationWarning = signal<string | null>(null);
  private reportingViolation = false;

  private isSittingLive(): boolean {
    return !!this.sitting() && !this.result();
  }

  private readonly onFullscreenChange = () => {
    if (this.isSittingLive() && !document.fullscreenElement) {
      this.reportViolation('fullscreen-exit', 'You left full screen.');
    }
  };

  private readonly onVisibilityChange = () => {
    if (this.isSittingLive() && document.hidden) {
      this.reportViolation('tab-hidden', 'You switched away from the exam tab or minimised the window.');
    }
  };

  constructor() {
    this.examId = Number(this.route.snapshot.paramMap.get('examId'));

    if (!this.examId) {
      this.startError.set('That exam link is not valid.');
    }

    window.addEventListener('beforeunload', this.beforeUnload);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    this.stopTimer();

    if (this.saveTimer !== null) clearTimeout(this.saveTimer);

    window.removeEventListener('beforeunload', this.beforeUnload);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    this.exitFullscreen();
  }

  /**
   * Full screen can only be requested from a genuine user gesture (a click),
   * so this is called from the "Start paper" click and again from the
   * warning overlay's "Return to full screen" click — never on its own.
   */
  private enterFullscreen(): void {
    const el = document.documentElement as HTMLElement & {
      requestFullscreen?: () => Promise<void>;
    };

    el.requestFullscreen?.().catch(() => {
      // The browser refused (or the device has no concept of full screen, e.g.
      // some tablets) — the violation reporting below still applies regardless.
    });
  }

  private exitFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => { /* nothing to do about it */ });
    }
  }

  /**
   * One strike, reported to the server so it is the record that counts — not
   * this component's own count, which a reload could otherwise reset. At the
   * limit the server says so and the paper is submitted with whatever has
   * been answered; short of it, a warning is shown asking the student back
   * into full screen.
   */
  private reportViolation(reason: string, description: string): void {
    const sitting = this.sitting();
    if (!sitting || this.result() || this.reportingViolation) return;

    this.reportingViolation = true;

    this.exams.recordViolation(sitting.attemptId, reason).subscribe({
      next: response => {
        this.reportingViolation = false;

        const { violationCount, limit, mustSubmit } = response.data;
        this.violationCount.set(violationCount);

        if (mustSubmit) {
          this.violationWarning.set(null);
          this.send(true, 'Exam closed — too many attempts to leave the exam window');
        } else {
          this.violationWarning.set(
            `${description} Strike ${violationCount} of ${limit} — one more and the paper ` +
            'submits automatically. Return to full screen to keep going.');
        }
      },
      error: () => { this.reportingViolation = false; }
    });
  }

  /** The warning overlay's own button — the user gesture full screen needs. */
  resumeFullscreen(): void {
    this.violationWarning.set(null);
    this.enterFullscreen();
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

        // ...and however many strikes this attempt already carries.
        this.violationCount.set(sitting.violationCount);

        this.secondsLeft.set(sitting.secondsRemaining);
        this.startTimer();

        // The click that just fired ("Start paper") is the user gesture full
        // screen needs — it will not work from here on any later tick.
        this.enterFullscreen();
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

  private send(auto: boolean, autoSummary?: string): void {
    const sitting = this.sitting();
    if (!sitting || this.submitting() || this.result()) return;

    this.submitting.set(true);
    this.violationWarning.set(null);

    this.exams.submit({ attemptId: sitting.attemptId, answers: this.answers() }).subscribe({
      next: response => {
        this.submitting.set(false);
        this.stopTimer();
        this.result.set(response.data);
        this.exitFullscreen();

        this.messages.add({
          severity: auto ? 'warn' : 'success',
          summary: auto ? (autoSummary ?? 'Time up — paper submitted') : 'Paper submitted',
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
    this.exitFullscreen();
    this.router.navigate(['/my-exams']);
  }
}
