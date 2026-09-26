import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService, SharedModule } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';

import { StudentLookup } from '../../core/models/student.model';
import { ExamFeeService } from '../../core/services/exam-fee.service';
import { StudentService } from '../../core/services/student.service';

/**
 * Moves an exam fee that was typed into Other income onto the right student's
 * exam fee: same date, amount, branch and person who received it - and removes
 * it from Other income, so it is neither lost nor counted twice.
 */
@Component({
  selector: 'app-move-to-exam-fee-dialog',
  imports: [CommonModule, FormsModule, SharedModule, ButtonModule, DialogModule, InputTextModule],
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      [style]="{ width: '32rem', maxWidth: '96vw' }"
      header="Move to exam fee">

      <p class="mv__lede">
        <strong>{{ purpose() }}</strong> · ₹{{ amount() | number: '1.0-2' }}<br />
        <span class="app-muted">
          Becomes the chosen student's exam fee payment (same date and who received it)
          and is removed from Other income.
        </span>
      </p>

      <input
        pInputText
        class="mv__search"
        [(ngModel)]="search"
        (ngModelChange)="find($event)"
        placeholder="Search student by name or registration id" />

      <ul class="mv__list">
        @for (s of results(); track s.id) {
          <li [class.mv__picked]="picked()?.id === s.id" (click)="picked.set(s)">
            <strong>{{ s.name }}</strong>
            <span class="app-muted">{{ s.registrationId }} · {{ s.courseName }}</span>
          </li>
        } @empty {
          @if (search.trim().length >= 2) { <li class="app-muted mv__none">No matching student.</li> }
        }
      </ul>

      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="visible.set(false)" />
        <p-button
          [label]="picked() ? 'Move to ' + picked()!.name + '\\'s exam fee' : 'Choose a student'"
          icon="pi pi-arrow-right"
          [disabled]="!picked()"
          [loading]="moving()"
          (onClick)="move()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .mv__lede { margin: 0 0 0.8rem; font-size: 0.9rem; }
    .mv__search { width: 100%; margin-bottom: 0.5rem; }
    .mv__list { list-style: none; margin: 0; padding: 0; max-height: 16rem; overflow-y: auto; }
    .mv__list li { display: grid; padding: 0.45rem 0.6rem; border-radius: 6px; cursor: pointer; }
    .mv__list li:hover { background: rgba(127, 127, 127, 0.1); }
    .mv__list li span { font-size: 0.8rem; }
    .mv__picked { outline: 2px solid var(--p-primary-color, #6366f1); }
    .mv__none { cursor: default; }
  `
})
export class MoveToExamFeeDialogComponent {
  private readonly examFees = inject(ExamFeeService);
  private readonly students = inject(StudentService);
  private readonly messages = inject(MessageService);

  readonly visible = model(false);
  readonly incomeId = input<number | null>(null);
  readonly purpose = input<string>('');
  readonly amount = input<number>(0);
  readonly moved = output<void>();

  readonly results = signal<StudentLookup[]>([]);
  readonly picked = signal<StudentLookup | null>(null);
  readonly moving = signal(false);
  search = '';

  constructor() {
    // Each time it opens, start from the name typed in the entry itself,
    // e.g. "Debalina Das(Exam Fees)" -> "Debalina Das".
    effect(() => {
      if (!this.visible()) return;
      this.picked.set(null);
      this.search = this.guessName(this.purpose());
      this.find(this.search);
    });
  }

  find(text: string): void {
    const q = (text ?? '').trim();
    if (q.length < 2) { this.results.set([]); return; }
    this.students.lookup(q, true).subscribe({
      next: rows => this.results.set(rows.slice(0, 20)),
      error: () => this.results.set([])
    });
  }

  move(): void {
    const id = this.incomeId();
    const student = this.picked();
    if (!id || !student) return;

    this.moving.set(true);
    this.examFees.moveFromOtherIncome(id, student.id).subscribe({
      next: r => {
        this.moving.set(false);
        this.messages.add({
          severity: 'success',
          summary: 'Moved to exam fee',
          detail: `${student.name}: exam fee paid ₹${r.data.paid}, still due ₹${r.data.due}.`,
          life: 5000
        });
        this.visible.set(false);
        this.moved.emit();
      },
      error: () => this.moving.set(false)
    });
  }

  private guessName(purpose: string): string {
    return (purpose ?? '')
      .replace(/\(([^)]*)\)/g, ' $1 ')
      .replace(/exam\s*fees?/gi, ' ')
      .replace(/\b(CIIT|DIIT|CIFA|CIDTP|SIAE|CIAE|DCA|ADCA)\b/gi, ' ')
      .replace(/[^A-Za-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
