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
  ExamResult,
  StudentExamResults
} from '../../core/models/exam.model';
import { admitCardHtml, openDocumentWindow } from '../../core/printing/legacy-documents';
import { ExamService } from '../../core/services/exam.service';

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
  imports: [CommonModule, ButtonModule, TableModule, TagModule],
  templateUrl: './my-exams.component.html',
  styleUrl: './my-exams.component.scss'
})
export class MyExamsComponent {
  private readonly exams = inject(ExamService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  readonly available = signal<AvailableExam[]>([]);
  readonly results = signal<ExamResult[]>([]);
  readonly standing = signal<StudentExamResults | null>(null);
  readonly admitCards = signal<AdmitCard[]>([]);

  readonly loading = signal(true);

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

  /* -------------------------------------------------------- admit card */

  /** Prints the card in the legacy layout, with the sitting the institute set. */
  printAdmitCard(card: AdmitCard): void {
    if (!openDocumentWindow(admitCardHtml(card))) {
      this.messages.add({
        severity: 'warn',
        summary: 'Popup blocked',
        detail: 'Allow popups for this site to print your admit card.',
        life: 6000
      });
    }
  }
}
