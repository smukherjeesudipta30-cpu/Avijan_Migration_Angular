import { CommonModule } from '@angular/common';
import { Component, input, model } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

import { ExamAttemptReview, ExamAttemptReviewItem } from '../../core/models/exam.model';

/**
 * A submitted online theory paper, read back question by question - read-only.
 *
 * Its own component because the same paper is opened from two screens: the
 * student's own results, and the staff mark sheet. The server decides what each
 * sees - the correct option only ever arrives for staff - so this just renders
 * whatever it is given.
 */
@Component({
  selector: 'app-exam-review-dialog',
  imports: [CommonModule, DialogModule, TagModule],
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      [dismissableMask]="true"
      [style]="{ width: '46rem', maxWidth: '96vw' }"
      [header]="review()?.title ?? 'Answer sheet'">

      @if (loading()) {
        <p class="app-muted">Loading…</p>
      } @else {
      @if (review(); as r) {
        <div class="rev__head">
          <div>
            <strong>{{ r.studentName || '—' }}</strong>
            <code class="rev__code">{{ r.registrationId }}</code>
          </div>
          <div class="rev__score">
            {{ r.score }} / {{ r.totalMarks }}
            <span class="app-muted">· {{ r.correctCount }} of {{ r.questionCount }} correct</span>
          </div>
          @if (r.submittedOn) {
            <div class="app-muted rev__sub">Submitted {{ r.submittedOn | date: 'd MMM y, h:mm a' }}</div>
          }
          <div class="app-muted rev__sub">Saved exactly as sat. This record cannot be changed.</div>
        </div>

        @for (q of r.questions; track q.questionNo) {
          <article class="rev__q" [class.rev__q--right]="q.isCorrect" [class.rev__q--wrong]="!q.isCorrect">
            <header class="rev__qhead">
              <span class="rev__no">Q{{ q.questionNo }}</span>
              <span class="rev__text">{{ q.questionText }}</span>
              @if (!q.chosenOption) {
                <p-tag value="Not answered" severity="secondary" />
              } @else if (q.isCorrect) {
                <p-tag value="Correct" severity="success" />
              } @else {
                <p-tag value="Wrong" severity="danger" />
              }
            </header>

            <ul class="rev__opts">
              @for (o of options(q); track o.key) {
                @if (o.text) {
                  <li
                    [class.rev__opt--chosen]="q.chosenOption === o.key"
                    [class.rev__opt--correct]="q.correctOption === o.key">
                    <span class="rev__key">{{ o.key }}</span>
                    <span>{{ o.text }}</span>
                    @if (q.chosenOption === o.key) { <em class="rev__mark">Your answer</em> }
                    @if (q.correctOption === o.key) { <em class="rev__mark rev__mark--ok">Correct answer</em> }
                  </li>
                }
              }
            </ul>
          </article>
        }
      }
      }
    </p-dialog>
  `,
  styles: `
    .rev__head { display: grid; gap: 0.2rem; margin-bottom: 1rem; }
    .rev__code { margin-left: 0.5rem; font-size: 0.8rem; }
    .rev__score { font-size: 1.1rem; font-weight: 600; }
    .rev__sub { font-size: 0.8rem; }
    .rev__q {
      border: 1px solid var(--p-content-border-color, #e2e8f0);
      border-left-width: 4px;
      border-radius: 6px;
      padding: 0.6rem 0.8rem;
      margin-bottom: 0.6rem;
    }
    .rev__q--right { border-left-color: #16a34a; }
    .rev__q--wrong { border-left-color: #dc2626; }
    .rev__qhead { display: flex; gap: 0.5rem; align-items: flex-start; }
    .rev__no { font-weight: 700; min-width: 2.2rem; }
    .rev__text { flex: 1; }
    .rev__opts { list-style: none; margin: 0.5rem 0 0; padding: 0 0 0 2.7rem; display: grid; gap: 0.25rem; }
    .rev__opts li { display: flex; gap: 0.5rem; align-items: baseline; padding: 0.15rem 0.4rem; border-radius: 4px; flex-wrap: wrap; }
    .rev__key { font-weight: 600; min-width: 1rem; }
    .rev__opt--chosen { background: rgba(59, 130, 246, 0.12); }
    .rev__opt--correct { background: rgba(22, 163, 74, 0.14); }
    .rev__mark { font-size: 0.75rem; font-style: normal; font-weight: 600; color: #2563eb; }
    .rev__mark--ok { color: #15803d; }
  `
})
export class ExamReviewDialogComponent {
  readonly visible = model(false);
  readonly review = input<ExamAttemptReview | null>(null);
  readonly loading = input(false);

  options(q: ExamAttemptReviewItem): { key: string; text: string }[] {
    return [
      { key: 'A', text: q.optionA },
      { key: 'B', text: q.optionB },
      { key: 'C', text: q.optionC },
      { key: 'D', text: q.optionD }
    ];
  }
}
