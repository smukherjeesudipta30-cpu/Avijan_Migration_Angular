import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { MessageService } from 'primeng/api';

import {
  AdmitCard,
  AvailableExam,
  ExamAttemptReview,
  ExamResult,
  StudentExamResults
} from '../../core/models/exam.model';
import { admitCardHtml, openDocumentWindow } from '../../core/printing/legacy-documents';
import { isNativeApp, saveAdmitCardPdf } from '../../core/printing/pdf-download';
import { ExamService } from '../../core/services/exam.service';
import { ExamFeeService } from '../../core/services/exam-fee.service';
import { StudentExamFee } from '../../core/models/exam-fee.model';
import { ExamReviewDialogComponent } from '../../shared/exam-review/exam-review-dialog.component';

/**
 * The student's examination portal: the papers they may sit, the ones they have
 * sat, and where they stand on each course.
 *
 * Only theory papers appear here — a practical is examined in the room and its
 * mark is entered by the institute. A term's grade is withheld until both its
 * papers are in, because a grade on half an examination would misrepresent it.
 */
@Component({
  selector: 'app-my-exams',
  imports: [CommonModule, ButtonModule, TableModule, TagModule, ExamReviewDialogComponent],
  templateUrl: './my-exams.component.html',
  styleUrl: './my-exams.component.scss'
})
export class MyExamsComponent {
  private readonly exams = inject(ExamService);
  private readonly examFees = inject(ExamFeeService);

  /** The student's own exam fee, for the reminder when some is still owed. */
  readonly examFee = signal<StudentExamFee | null>(null);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  readonly available = signal<AvailableExam[]>([]);
  readonly results = signal<ExamResult[]>([]);
  readonly standing = signal<StudentExamResults | null>(null);
  readonly admitCards = signal<AdmitCard[]>([]);

  readonly loading = signal(true);

  readonly reviewOpen = signal(false);
  readonly reviewLoading = signal(false);
  readonly review = signal<ExamAttemptReview | null>(null);

  readonly openNow = computed(
    () => this.available().filter(e => e.status === 'NotStarted' || e.status === 'InProgress'));

  /**
   * Everything the student cannot sit yet — including papers published for their
   * course that the institute has not sat them for. Showing those matters: the
   * student can see the exam exists and that they are waiting on a date.
   */
  readonly notOpen = computed(
    () => this.available().filter(e =>
      e.status === 'NotOpen'
      || e.status === 'Closed'
      || e.status === 'Scheduled'
      || e.status === 'NotScheduled'));

  readonly done = computed(() => this.available().filter(e => e.status === 'Submitted'));

  constructor() {
    /* The exam fee is checked first: while some is owed the admit card is
       held back (the server refuses it too), so it is only fetched once paid. */
    this.examFees.mine().subscribe({
      next: f => {
        this.examFee.set(f);
        if (!this.feeBlocksAdmitCard()) this.loadAdmitCards();
      },
      error: () => {
        this.examFee.set(null);
        this.loadAdmitCards();
      }
    });

    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.exams.available().subscribe({
      next: rows => {
        this.available.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });

    this.exams.myResults().subscribe({ next: rows => this.results.set(rows) });
    this.exams.myCourseResults().subscribe({ next: data => this.standing.set(data) });
  }

  /** Exam fee set and not fully paid: the admit card waits until it is. */
  feeBlocksAdmitCard(): boolean {
    const f = this.examFee();
    return !!f && f.examFee !== null && f.examFee !== undefined && f.due > 0;
  }

  private loadAdmitCards(): void {
    this.exams.admitCards().subscribe({ next: cards => this.admitCards.set(cards) });
  }

  sit(exam: AvailableExam): void {
    this.router.navigate(['/my-exams', exam.examId, 'sit']);
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'NotScheduled': return 'Awaiting a date';
      case 'Scheduled': return 'Scheduled';
      case 'NotStarted': return 'Ready to sit';
      case 'InProgress': return 'In progress';
      case 'Submitted': return 'Submitted';
      case 'NotOpen': return 'Not open yet';
      case 'Closed': return 'Closed';
      default: return status;
    }
  }

  statusSeverity(status: string): 'success' | 'info' | 'warn' | 'secondary' {
    switch (status) {
      case 'NotStarted': return 'success';
      case 'InProgress': return 'warn';
      case 'Scheduled': return 'info';
      case 'Submitted': return 'info';
      default: return 'secondary';
    }
  }

  /* ----------------------------------------------------- answer sheet */

  /** The student's own submitted online paper, read-only. */
  openReview(result: ExamResult): void {
    this.review.set(null);
    this.reviewLoading.set(true);
    this.reviewOpen.set(true);

    this.exams.myReview(result.attemptId).subscribe({
      next: r => {
        this.review.set(r);
        this.reviewLoading.set(false);
      },
      error: () => {
        this.reviewLoading.set(false);
        this.reviewOpen.set(false);
        this.messages.add({
          severity: 'warn',
          summary: 'Not available',
          detail: 'The answer sheet for this paper could not be opened.',
          life: 6000
        });
      }
    });
  }

  /* -------------------------------------------------------- admit card */

  /**
   * Saves the card as a PDF and, on a computer, also opens it in the legacy
   * print layout. The app's WebView has no print popup, so there the saved
   * PDF (handed to the share sheet) is the whole of it.
   */
  printAdmitCard(card: AdmitCard): void {
    const popupOk = isNativeApp() || openDocumentWindow(admitCardHtml(card));

    saveAdmitCardPdf(card).catch(() => this.pdfFailed('admit card'));

    if (!popupOk) {
      this.messages.add({
        severity: 'warn',
        summary: 'Popup blocked',
        detail: 'Allow popups for this site to print your admit card.',
        life: 6000
      });
    }
  }

  private pdfFailed(what: string): void {
    this.messages.add({
      severity: 'warn',
      summary: 'PDF not saved',
      detail: `Could not save the ${what} as a PDF. Try again.`,
      life: 6000
    });
  }
}
