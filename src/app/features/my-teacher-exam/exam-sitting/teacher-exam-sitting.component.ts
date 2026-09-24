import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { RadioButtonModule } from 'primeng/radiobutton';

import {
  TeacherExamAnswerRequest,
  TeacherExamPaper,
  TeacherExamResult
} from '../../../core/models/teacher-exam.model';
import { TeacherExamService } from '../../../core/services/teacher-exam.service';

/**
 * Sitting a teacher competency exam — same full-screen/tab-switch proctoring
 * as the student exam portal (see ExamSittingComponent): leaving is reported
 * to the server, not just shown as a client-side warning, so a reload cannot
 * reset the strike count, and three strikes auto-submits whatever has been
 * answered so far.
 */
@Component({
  selector: 'app-teacher-exam-sitting',
  imports: [CommonModule, FormsModule, ButtonModule, ConfirmDialogModule, RadioButtonModule],
  providers: [ConfirmationService],
  templateUrl: './teacher-exam-sitting.component.html',
  styleUrl: './teacher-exam-sitting.component.scss'
})
export class TeacherExamSittingComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly exams = inject(TeacherExamService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly paper = signal<TeacherExamPaper | null>(null);
  readonly result = signal<TeacherExamResult | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly startError = signal<string | null>(null);

  /** Question id to the option picked. */
  readonly answers = signal<Record<number, string>>({});

  readonly answeredCount = computed(() => Object.keys(this.answers()).length);
  readonly questionCount = computed(() => this.paper()?.questions.length ?? 0);
  readonly allAnswered = computed(
    () => this.questionCount() > 0 && this.answeredCount() === this.questionCount());

  private scheduleId = 0;

  /* ------------------------------------------------------------ proctoring */
  readonly violationCount = signal(0);
  readonly violationWarning = signal<string | null>(null);
  private reportingViolation = false;

  private isSittingLive(): boolean {
    return !!this.paper() && !this.result();
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

  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.isSittingLive()) event.preventDefault();
  };

  constructor() {
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('beforeunload', this.beforeUnload);
  }

  ngOnInit(): void {
    this.scheduleId = Number(this.route.snapshot.paramMap.get('scheduleId'));

    if (!this.scheduleId) {
      this.startError.set('That exam link is not valid.');
      this.loading.set(false);
      return;
    }

    this.exams.start(this.scheduleId).subscribe({
      next: response => {
        this.paper.set(response.data);
        this.loading.set(false);
        this.enterFullscreen();
      },
      error: () => this.loading.set(false)
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('beforeunload', this.beforeUnload);
    this.exitFullscreen();
  }

  private enterFullscreen(): void {
    const el = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
    el.requestFullscreen?.().catch(() => { /* not every device supports it */ });
  }

  private exitFullscreen(): void {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => { /* nothing to do about it */ });
    }
  }

  resumeFullscreen(): void {
    this.violationWarning.set(null);
    this.enterFullscreen();
  }

  private currentAnswers(): TeacherExamAnswerRequest[] {
    return Object.entries(this.answers()).map(([questionId, selectedOption]) => ({
      questionId: Number(questionId),
      selectedOption
    }));
  }

  private reportViolation(reason: string, description: string): void {
    const attemptId = this.paper()?.attemptId;
    if (!attemptId || this.result() || this.reportingViolation) return;

    this.reportingViolation = true;

    this.exams.recordViolation({ attemptId, reason, answers: this.currentAnswers() }).subscribe({
      next: response => {
        this.reportingViolation = false;

        const { violationCount, limit, mustSubmit, result } = response.data;
        this.violationCount.set(violationCount);

        if (mustSubmit) {
          this.violationWarning.set(null);
          if (result) {
            this.result.set(result);
            this.exitFullscreen();
            this.messages.add({
              severity: 'warn',
              summary: 'Exam closed — too many attempts to leave the exam window',
              detail: `You scored ${result.scorePercent}%.`,
              life: 8000
            });
          }
        } else {
          this.violationWarning.set(
            `${description} Strike ${violationCount} of ${limit} — one more and the paper ` +
            'submits automatically. Return to full screen to keep going.');
        }
      },
      error: () => { this.reportingViolation = false; }
    });
  }

  choose(questionId: number, option: string): void {
    this.answers.update(current => ({ ...current, [questionId]: option }));
  }

  clearAnswer(questionId: number): void {
    this.answers.update(current => {
      const next = { ...current };
      delete next[questionId];
      return next;
    });
  }

  isChosen(questionId: number, option: string): boolean {
    return this.answers()[questionId] === option;
  }

  isAnswered(questionId: number): boolean {
    return this.answers()[questionId] !== undefined;
  }

  submit(): void {
    const unanswered = this.questionCount() - this.answeredCount();

    this.confirm.confirm({
      header: 'Submit your exam',
      message: unanswered > 0
        ? `You have left ${unanswered} question(s) unanswered. Once submitted the exam ` +
          'cannot be reopened. Submit anyway?'
        : 'Once submitted the exam cannot be reopened. Submit now?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Submit',
      rejectLabel: 'Keep working',
      accept: () => this.send()
    });
  }

  private send(): void {
    const paper = this.paper();
    if (!paper || this.submitting() || this.result()) return;

    this.submitting.set(true);
    this.violationWarning.set(null);

    this.exams.submit({ attemptId: paper.attemptId, answers: this.currentAnswers() }).subscribe({
      next: response => {
        this.submitting.set(false);
        this.result.set(response.data);
        this.exitFullscreen();

        this.messages.add({
          severity: response.data.passed ? 'success' : 'warn',
          summary: response.data.passed ? 'Passed' : 'Not passed',
          detail: `You scored ${response.data.scorePercent}% (${response.data.correctCount} of ${response.data.totalQuestions}).`,
          life: 8000
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: () => this.submitting.set(false)
    });
  }

  back(): void {
    this.exitFullscreen();
    this.router.navigate(['/my-teacher-exam']);
  }
}
