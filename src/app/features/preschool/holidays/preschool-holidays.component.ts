import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { PreSchoolHoliday, todayIso } from '../../../core/models/preschool.model';
import { PreSchoolService } from '../../../core/services/preschool.service';

interface HolidayDraft {
  id: number | null;
  fromDate: string;
  toDate: string;
  title: string;
  note: string;
}

const blank = (): HolidayDraft => ({ id: null, fromDate: todayIso(), toDate: '', title: '', note: '' });

/**
 * The PreSchool's holiday notices, kept by its admin and receptionist. Closures
 * from today up to 60 days ahead show on the PreSchool website and on every
 * parent's page. The Computer Centre's holiday list is separate.
 */
@Component({
  selector: 'app-preschool-holidays',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>Holiday notices</h1>
      <p class="app-muted">Days the PreSchool is closed. Closures in the next 60 days show on the PreSchool website
        and on every parent's page. The Computer Centre keeps its own holiday list.</p>
    </div>

    <div class="psh">
      <section class="app-card psh__form">
        <h2>{{ draft.id === null ? 'Add a holiday' : 'Edit holiday' }}</h2>
        <label>Holiday name <input pInputText [(ngModel)]="draft.title" maxlength="150" placeholder="Durga Puja vacation" /></label>
        <div class="psh__dates">
          <label>From <input pInputText type="date" [(ngModel)]="draft.fromDate" /></label>
          <label>To (if more than one day) <input pInputText type="date" [(ngModel)]="draft.toDate" [min]="draft.fromDate" /></label>
        </div>
        <label>Notice for parents (optional)
          <textarea pInputText rows="2" [(ngModel)]="draft.note" maxlength="300" placeholder="School reopens on Monday."></textarea></label>
        <div class="psh__actions">
          <p-button [label]="draft.id === null ? 'Add holiday' : 'Save'" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
          @if (draft.id !== null) {
            <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="draft = blankDraft()" />
          }
        </div>
      </section>

      <section class="psh__list">
        <div class="psh__year">
          <p-button icon="pi pi-chevron-left" [text]="true" [rounded]="true" ariaLabel="Previous year" (onClick)="setYear(year() - 1)" />
          <strong>{{ year() }}</strong>
          <p-button icon="pi pi-chevron-right" [text]="true" [rounded]="true" ariaLabel="Next year" (onClick)="setYear(year() + 1)" />
        </div>
        @for (h of list(); track h.id) {
          <article class="app-card psh__item" [class.psh__item--past]="h.toDate < today">
            <div class="psh__date">
              <strong>{{ h.fromDate | date: 'd MMM' }}</strong>
              @if (h.toDate !== h.fromDate) { <span>to {{ h.toDate | date: 'd MMM' }}</span> }
            </div>
            <div class="psh__text">
              <strong>{{ h.title }}</strong>
              @if (h.note) { <span class="app-muted">{{ h.note }}</span> }
            </div>
            <div class="psh__row-actions">
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" ariaLabel="Edit" (onClick)="edit(h)" />
              <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" ariaLabel="Remove" (onClick)="remove(h)" />
            </div>
          </article>
        } @empty {
          <p class="app-muted">No PreSchool holidays in {{ year() }} yet.</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .psh { display: grid; grid-template-columns: minmax(18rem, 24rem) 1fr; gap: 1rem; align-items: start; }
    .psh__form { display: flex; flex-direction: column; gap: 0.8rem; padding: 1rem 1.1rem; }
    .psh__form h2 { margin: 0; font-size: 1.05rem; }
    .psh__form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .psh__dates { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
    .psh__actions { display: flex; gap: 0.6rem; }
    .psh__list { display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }
    .psh__year { display: flex; align-items: center; gap: 0.4rem; }
    .psh__item { display: flex; gap: 1rem; align-items: center; padding: 0.75rem 1rem; }
    .psh__item--past { opacity: 0.55; }
    .psh__date { display: flex; flex-direction: column; min-width: 5.5rem; }
    .psh__date strong { color: #b3264f; }
    .psh__date span { font-size: 0.8rem; color: var(--app-text-muted); }
    .psh__text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .psh__row-actions { display: flex; }
    @media (max-width: 900px) { .psh { grid-template-columns: 1fr; } }
  `]
})
export class PreSchoolHolidaysComponent implements OnInit {
  private readonly preschool = inject(PreSchoolService);
  private readonly messages = inject(MessageService);

  readonly year = signal(new Date().getFullYear());
  readonly list = signal<PreSchoolHoliday[]>([]);
  readonly saving = signal(false);
  readonly today = todayIso();
  readonly blankDraft = blank;

  draft: HolidayDraft = blank();

  ngOnInit(): void { this.load(); }

  setYear(y: number): void { this.year.set(y); this.load(); }

  private load(): void {
    this.preschool.holidays(this.year()).subscribe(items => this.list.set(items));
  }

  edit(h: PreSchoolHoliday): void {
    this.draft = { id: h.id, fromDate: h.fromDate, toDate: h.toDate === h.fromDate ? '' : h.toDate, title: h.title, note: h.note ?? '' };
  }

  save(): void {
    const d = this.draft;
    if (!d.title.trim()) return this.warn('Give the holiday a name.');
    if (!d.fromDate) return this.warn('Pick the first day.');
    if (d.toDate && d.toDate < d.fromDate) return this.warn('The last day cannot be before the first.');
    this.saving.set(true);
    this.preschool.saveHoliday(d.id, { fromDate: d.fromDate, toDate: d.toDate || null, title: d.title.trim(), note: d.note.trim() || null })
      .subscribe({
        next: saved => {
          this.saving.set(false);
          this.messages.add({ severity: 'success', summary: d.id === null ? 'Holiday added' : 'Holiday saved', life: 2500 });
          this.draft = blank();
          const y = Number(saved.fromDate.slice(0, 4));
          if (y !== this.year()) this.year.set(y);
          this.load();
        },
        error: () => this.saving.set(false)
      });
  }

  remove(h: PreSchoolHoliday): void {
    this.preschool.deleteHoliday(h.id).subscribe(() => {
      this.messages.add({ severity: 'success', summary: 'Holiday removed', life: 2500 });
      if (this.draft.id === h.id) this.draft = blank();
      this.load();
    });
  }

  private warn(detail: string): void {
    this.messages.add({ severity: 'warn', summary: 'Please check', detail, life: 4000 });
  }
}
