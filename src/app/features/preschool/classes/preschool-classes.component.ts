import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolClass } from '../../../core/models/preschool.model';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolService } from '../../../core/services/preschool.service';

/** A class as edited on the form; ages in years (0.5 steps) rather than the months stored. */
interface ClassDraft {
  id: number | null;
  name: string;
  sortOrder: number;
  admissionFee: number | null;
  minAgeYears: number | null;
  maxAgeYears: number | null;
  isActive: boolean;
}

/** A fee head or subject row as edited; `amount` is the monthly fee or the full marks. */
interface RowDraft {
  id: number | null;
  name: string;
  amount: number | null;
  sortOrder: number;
  isActive: boolean;
  saving: boolean;
}

const toYears = (months: number | null | undefined) => months == null ? null : Math.round(months / 6) / 2;
const toMonths = (years: number | null | string) =>
  years === null || years === '' ? null : Math.round(Number(years) * 12);

/**
 * Classes, their monthly fees and their subjects. The PreSchool admin edits;
 * its receptionist and teachers see the same page read-only. Nothing is
 * deleted — a class, fee or subject no longer used is unticked as Active.
 */
@Component({
  selector: 'app-preschool-classes',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>Classes &amp; fees</h1>
      <p class="app-muted">All fees are monthly. A child's month is the total of their class's active fees;
        the admission fee is charged once, when they join.</p>
    </div>

    <div class="psc">
      <nav class="psc__list app-card" aria-label="Classes">
        @for (c of classes(); track c.id) {
          <button type="button" class="psc__pick" [class.psc__pick--on]="c.id === selectedId()"
            [class.psc__pick--off]="!c.isActive" (click)="select(c.id)">
            <span>{{ c.name }}</span>
            <small>{{ money(c.monthlyTotal) }}/month</small>
          </button>
        }
        @if (canEdit()) {
          <p-button label="Add class" icon="pi pi-plus" [text]="true" size="small" (onClick)="newClass()" />
        }
      </nav>

      @if (draft(); as d) {
        <div class="psc__detail">
          <section class="app-card">
            <h2>{{ d.id === null ? 'New class' : d.name }}</h2>
            <div class="psc__form">
              <label>Class name <input pInputText [(ngModel)]="d.name" [disabled]="!canEdit()" maxlength="50" /></label>
              <label>Order <input pInputText type="number" [(ngModel)]="d.sortOrder" [disabled]="!canEdit()" /></label>
              <label>Admission fee (₹)
                <input pInputText type="number" min="0" [(ngModel)]="d.admissionFee" [disabled]="!canEdit()" /></label>
              <label>Youngest age (years)
                <input pInputText type="number" min="0" step="0.5" placeholder="Any"
                  [(ngModel)]="d.minAgeYears" [disabled]="!canEdit()" /></label>
              <label>Oldest age (years)
                <input pInputText type="number" min="0" step="0.5" placeholder="Any"
                  [(ngModel)]="d.maxAgeYears" [disabled]="!canEdit()" /></label>
              <label class="psc__check"><input type="checkbox" [(ngModel)]="d.isActive" [disabled]="!canEdit()" />
                Active (taking admissions)</label>
            </div>
            @if (canEdit()) {
              <p-button [label]="d.id === null ? 'Add class' : 'Save class'" icon="pi pi-check"
                [loading]="savingClass()" (onClick)="saveClass(d)" />
            }
          </section>

          @if (d.id !== null) {
            <section class="app-card">
              <div class="psc__head">
                <h2>Monthly fees</h2>
                <strong>Total {{ money(selected()?.monthlyTotal ?? 0) }}/month</strong>
              </div>
              <div class="psc__rows">
                <div class="psc__row psc__row--head"><span>Fee</span><span>₹ per month</span><span>Order</span><span>Active</span><span></span></div>
                @for (r of fees(); track $index) {
                  <div class="psc__row">
                    <input pInputText [(ngModel)]="r.name" placeholder="e.g. Tuition" [disabled]="!canEdit()" maxlength="80" />
                    <input pInputText type="number" min="0" [(ngModel)]="r.amount" [disabled]="!canEdit()" />
                    <input pInputText type="number" [(ngModel)]="r.sortOrder" [disabled]="!canEdit()" />
                    <input type="checkbox" [(ngModel)]="r.isActive" [disabled]="!canEdit()" aria-label="Active" />
                    @if (canEdit()) {
                      <p-button icon="pi pi-check" [rounded]="true" [text]="true" [loading]="r.saving"
                        ariaLabel="Save fee" (onClick)="saveFee(r)" />
                    }
                  </div>
                } @empty {
                  <p class="app-muted">No monthly fees yet.</p>
                }
              </div>
              @if (canEdit()) {
                <p-button label="Add fee" icon="pi pi-plus" [text]="true" size="small" (onClick)="addRow(fees, 0)" />
              }
            </section>

            <section class="app-card">
              <h2>Subjects</h2>
              <div class="psc__rows">
                <div class="psc__row psc__row--head"><span>Subject</span><span>Full marks</span><span>Order</span><span>Active</span><span></span></div>
                @for (r of subjects(); track $index) {
                  <div class="psc__row">
                    <input pInputText [(ngModel)]="r.name" placeholder="e.g. English" [disabled]="!canEdit()" maxlength="80" />
                    <input pInputText type="number" min="1" [(ngModel)]="r.amount" [disabled]="!canEdit()" />
                    <input pInputText type="number" [(ngModel)]="r.sortOrder" [disabled]="!canEdit()" />
                    <input type="checkbox" [(ngModel)]="r.isActive" [disabled]="!canEdit()" aria-label="Active" />
                    @if (canEdit()) {
                      <p-button icon="pi pi-check" [rounded]="true" [text]="true" [loading]="r.saving"
                        ariaLabel="Save subject" (onClick)="saveSubject(r)" />
                    }
                  </div>
                } @empty {
                  <p class="app-muted">No subjects yet.</p>
                }
              </div>
              @if (canEdit()) {
                <p-button label="Add subject" icon="pi pi-plus" [text]="true" size="small" (onClick)="addRow(subjects, 100)" />
              }
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .psc { display: grid; grid-template-columns: 14rem 1fr; gap: 1rem; align-items: start; }
    .psc__list { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.6rem; }
    .psc__pick { display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem; padding: 0.6rem 0.75rem;
      border: 1px solid transparent; border-radius: 10px; background: transparent; font: inherit; text-align: left; cursor: pointer; }
    .psc__pick span { font-weight: 600; }
    .psc__pick small { color: var(--app-text-muted); font-size: 0.75rem; }
    .psc__pick:hover { background: #f5f3ff; }
    .psc__pick--on { background: #ede9fe; border-color: #c4b5fd; }
    .psc__pick--off span { text-decoration: line-through; opacity: 0.6; }
    .psc__detail { display: flex; flex-direction: column; gap: 1rem; min-width: 0; }
    .psc__detail h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .psc__head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
    .psc__form { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.8rem; margin-bottom: 0.9rem; }
    .psc__form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .psc__form .psc__check { flex-direction: row; align-items: center; gap: 0.45rem; align-self: end; padding-bottom: 0.5rem; }
    .psc__rows { display: flex; flex-direction: column; gap: 0.4rem; }
    .psc__row { display: grid; grid-template-columns: minmax(8rem, 2fr) minmax(5rem, 1fr) 4.5rem 3.5rem 2.5rem; gap: 0.5rem; align-items: center; }
    .psc__row input[type='checkbox'] { justify-self: center; width: 1.1rem; height: 1.1rem; }
    .psc__row input[pInputText] { width: 100%; min-width: 0; }
    .psc__row--head span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--app-text-muted); }
    .psc__row--head span:nth-child(4) { text-align: center; }
    @media (max-width: 900px) { .psc { grid-template-columns: 1fr; } .psc__list { flex-direction: row; flex-wrap: wrap; } }
  `]
})
export class PreSchoolClassesComponent implements OnInit {
  private readonly preschool = inject(PreSchoolService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly classes = signal<PreSchoolClass[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly draft = signal<ClassDraft | null>(null);
  readonly fees = signal<RowDraft[]>([]);
  readonly subjects = signal<RowDraft[]>([]);
  readonly savingClass = signal(false);

  readonly canEdit = computed(() => this.auth.hasAnyRole(['PreSchoolHead']));
  readonly selected = computed(() => this.classes().find(c => c.id === this.selectedId()) ?? null);
  readonly money = formatMoney;

  ngOnInit(): void {
    const wanted = Number(this.route.snapshot.queryParamMap.get('class')) || null;
    this.load(wanted);
  }

  private load(selectId: number | null): void {
    this.preschool.overview().subscribe({
      next: o => {
        this.classes.set(o.classes);
        const id = selectId && o.classes.some(c => c.id === selectId) ? selectId : o.classes[0]?.id ?? null;
        if (id !== null) this.select(id); else this.newClass();
      },
      error: () => { /* the error interceptor has already said why */ }
    });
  }

  select(id: number): void {
    const c = this.classes().find(x => x.id === id);
    if (!c) return;
    this.selectedId.set(id);
    this.draft.set({
      id: c.id, name: c.name, sortOrder: c.sortOrder, admissionFee: c.admissionFee,
      minAgeYears: toYears(c.minAgeMonths), maxAgeYears: toYears(c.maxAgeMonths), isActive: c.isActive
    });
    this.fees.set(c.feeHeads.map(f => ({ id: f.id, name: f.name, amount: f.monthlyAmount, sortOrder: f.sortOrder, isActive: f.isActive, saving: false })));
    this.subjects.set(c.subjects.map(s => ({ id: s.id, name: s.name, amount: s.maxMarks, sortOrder: s.sortOrder, isActive: s.isActive, saving: false })));
    void this.router.navigate([], { queryParams: { class: id }, replaceUrl: true });
  }

  newClass(): void {
    this.selectedId.set(null);
    const next = Math.max(0, ...this.classes().map(c => c.sortOrder)) + 1;
    this.draft.set({ id: null, name: '', sortOrder: next, admissionFee: 0, minAgeYears: null, maxAgeYears: null, isActive: true });
    this.fees.set([]);
    this.subjects.set([]);
  }

  addRow(list: typeof this.fees, amount: number): void {
    const next = Math.max(0, ...list().map(r => r.sortOrder)) + 1;
    list.update(rows => [...rows, { id: null, name: '', amount, sortOrder: next, isActive: true, saving: false }]);
  }

  saveClass(d: ClassDraft): void {
    if (!d.name.trim()) { this.warn('Give the class a name.'); return; }
    const fee = Number(d.admissionFee ?? 0);
    if (!(fee >= 0)) { this.warn('The admission fee cannot be negative.'); return; }
    this.savingClass.set(true);
    this.preschool.saveClass(d.id, {
      name: d.name.trim(), sortOrder: Number(d.sortOrder) || 0, admissionFee: fee,
      minAgeMonths: toMonths(d.minAgeYears), maxAgeMonths: toMonths(d.maxAgeYears), isActive: d.isActive
    }).subscribe({
      next: saved => {
        this.savingClass.set(false);
        this.done(d.id === null ? 'Class added.' : 'Class saved.');
        this.load(saved.id);
      },
      error: () => this.savingClass.set(false)
    });
  }

  saveFee(r: RowDraft): void {
    const classId = this.selectedId();
    if (classId === null) return;
    if (!r.name.trim()) { this.warn('Give the fee a name.'); return; }
    const amount = Number(r.amount ?? 0);
    if (!(amount >= 0)) { this.warn('The amount cannot be negative.'); return; }
    this.saveRow(r, this.preschool.saveFeeHead(r.id, {
      classId, name: r.name.trim(), monthlyAmount: amount, sortOrder: Number(r.sortOrder) || 0, isActive: r.isActive
    }), 'Fee saved.');
  }

  saveSubject(r: RowDraft): void {
    const classId = this.selectedId();
    if (classId === null) return;
    if (!r.name.trim()) { this.warn('Give the subject a name.'); return; }
    const marks = Number(r.amount);
    if (!Number.isInteger(marks) || marks < 1) { this.warn('Full marks must be a whole number above 0.'); return; }
    this.saveRow(r, this.preschool.saveSubject(r.id, {
      classId, name: r.name.trim(), maxMarks: marks, sortOrder: Number(r.sortOrder) || 0, isActive: r.isActive
    }), 'Subject saved.');
  }

  /** Saves one row, then reloads so the class's monthly total and the list stay right. A failure is shown by the error interceptor. */
  private saveRow(r: RowDraft, call: Observable<unknown>, done: string): void {
    r.saving = true;
    call.subscribe({
      next: () => { r.saving = false; this.done(done); this.load(this.selectedId()); },
      error: () => { r.saving = false; }
    });
  }

  private done(summary: string): void {
    this.messages.add({ severity: 'success', summary, life: 2500 });
  }

  private warn(detail: string): void {
    this.messages.add({ severity: 'warn', summary: 'Please check', detail, life: 4000 });
  }
}
