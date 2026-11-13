import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { PreSchoolClass, PreSchoolGradeBand } from '../../../core/models/preschool.model';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolExam, PreSchoolMarkSheet, PreSchoolMarksService } from '../../../core/services/preschool-marks.service';

/** What is typed in one cell: a number, "A" for absent, or nothing yet. */
type Cell = string;

/**
 * Entering marks from the PreSchool's offline exams: pick the exam and the
 * class, and type each child's marks in each subject ("A" for absent). Total,
 * percentage and grade follow as you type. No report card is printed.
 */
@Component({
  selector: 'app-preschool-marks',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>Marks</h1>
      <p class="app-muted">Pick the exam and the class, then type each child's marks. Type <strong>A</strong> for absent; leave a box empty if not marked yet.</p>
    </div>

    <section class="app-card pm-pick">
      <label>Exam
        <select [ngModel]="examId()" (ngModelChange)="examId.set($event); load()">
          <option [ngValue]="0" disabled>Pick an exam</option>
          @for (e of exams(); track e.id) {
            <option [ngValue]="e.id" [disabled]="!e.isActive">{{ e.name }}@if (e.heldOn) { ({{ e.heldOn | date: 'd MMM y' }}) }</option>
          }
        </select></label>
      <label>Class
        <select [ngModel]="classId()" (ngModelChange)="classId.set($event); load()">
          <option [ngValue]="0" disabled>Pick a class</option>
          @for (c of classes(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
        </select></label>
      @if (isOffice()) {
        @if (addingExam()) {
          <div class="pm-new">
            <label>New exam <input pInputText [(ngModel)]="newExamName" maxlength="80" placeholder="e.g. Half Yearly" /></label>
            <label>Held on <input pInputText type="date" [(ngModel)]="newExamDate" /></label>
            <p-button label="Add" size="small" (onClick)="addExam()" />
            <p-button label="Cancel" size="small" [text]="true" (onClick)="addingExam.set(false)" />
          </div>
        } @else {
          <p-button label="Add exam" icon="pi pi-plus" size="small" [text]="true" (onClick)="addingExam.set(true)" />
        }
      }
    </section>

    @if (sheet(); as sh) {
      <section class="app-card pm-sheet">
        <div class="pm-head">
          <h2>{{ sh.examName }} · {{ sh.className }}</h2>
          <p-button label="Save marks" icon="pi pi-check" [loading]="saving()" [disabled]="!dirty()" (onClick)="save()" />
        </div>
        @if (!sh.subjects.length) {
          <p class="app-muted">{{ sh.className }} has no subjects yet. Add them in Classes &amp; Fees.</p>
        } @else if (!sh.rows.length) {
          <p class="app-muted">No children studying in {{ sh.className }}.</p>
        } @else {
          <div class="pm-scroll">
            <table>
              <thead>
                <tr>
                  <th class="pm-name">Child</th>
                  @for (s of sh.subjects; track s.id) { <th>{{ s.name }}<small>/ {{ s.maxMarks }}</small></th> }
                  <th>Total</th><th>%</th><th>Grade</th>
                </tr>
              </thead>
              <tbody>
                @for (r of sh.rows; track r.studentId; let ri = $index) {
                  <tr>
                    <td class="pm-name"><strong>{{ r.childName }}</strong><small>{{ r.admissionCode }}</small></td>
                    @for (s of sh.subjects; track s.id; let si = $index) {
                      <td>
                        <input class="pm-cell" [class.pm-bad]="!valid(ri, si)" [class.pm-ab]="isAbsent(ri, si)" inputmode="decimal" maxlength="6"
                          [ngModel]="cells()[ri][si]" (ngModelChange)="setCell(ri, si, $event)" [attr.aria-label]="r.childName + ' ' + s.name" />
                      </td>
                    }
                    <td class="pm-num">{{ summary(ri).total }}<small>/ {{ summary(ri).outOf }}</small></td>
                    <td class="pm-num">{{ summary(ri).percent ?? '—' }}</td>
                    <td class="pm-grade">{{ summary(ri).grade ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (dirty()) { <p class="pm-unsaved">Changes not saved yet.</p> }
        }
      </section>
    }
  `,
  styles: [`
    .pm-pick { display: flex; gap: 0.8rem; align-items: flex-end; flex-wrap: wrap; margin-bottom: 1rem; }
    .pm-pick label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .pm-pick select { padding: 0.5rem 0.6rem; min-width: 11rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .pm-new { display: flex; gap: 0.5rem; align-items: flex-end; flex-wrap: wrap; }
    .pm-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .pm-head h2 { margin: 0; font-size: 1.05rem; }
    .pm-scroll { overflow-x: auto; }
    table { border-collapse: separate; border-spacing: 0; font-size: 0.88rem; min-width: 100%; }
    th, td { padding: 0.4rem 0.45rem; border-bottom: 1px solid var(--app-border); text-align: center; white-space: nowrap; }
    th { font-size: 0.72rem; text-transform: uppercase; color: var(--app-text-muted); }
    th small, td small { display: block; font-size: 0.68rem; color: var(--app-text-muted); text-transform: none; }
    .pm-name { position: sticky; left: 0; background: var(--app-surface, #fff); text-align: left; z-index: 1; min-width: 9rem; }
    .pm-cell { width: 3.6rem; padding: 0.35rem; border: 1px solid var(--app-border); border-radius: 6px; text-align: center; font: inherit; }
    .pm-cell:focus { outline: 2px solid #6d28d9; border-color: #6d28d9; }
    .pm-ab { background: #fff1d6; color: #9a5b00; font-weight: 700; }
    .pm-bad { border-color: #b42318; background: #fde2e2; }
    .pm-num { font-weight: 600; }
    .pm-grade { font-weight: 800; color: #6d28d9; }
    .pm-unsaved { margin: 0.6rem 0 0; color: #9a5b00; font-weight: 600; font-size: 0.85rem; }
  `]
})
export class PreSchoolMarksComponent implements OnInit {
  private readonly marksApi = inject(PreSchoolMarksService);
  private readonly preschool = inject(PreSchoolService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly exams = signal<PreSchoolExam[]>([]);
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly bands = signal<PreSchoolGradeBand[]>([]);
  readonly examId = signal(0);
  readonly classId = signal(0);
  readonly sheet = signal<PreSchoolMarkSheet | null>(null);
  /** What is in each box, row by row and subject by subject. */
  readonly cells = signal<Cell[][]>([]);
  private saved: Cell[][] = [];
  readonly saving = signal(false);
  readonly addingExam = signal(false);
  readonly isOffice = computed(() => this.auth.hasAnyRole(['PreSchoolHead', 'PreSchoolFrontDesk']));
  readonly dirty = computed(() => JSON.stringify(this.cells()) !== JSON.stringify(this.saved) && this.cells().length > 0);

  newExamName = '';
  newExamDate = '';

  ngOnInit(): void {
    this.marksApi.exams().subscribe(e => {
      this.exams.set(e);
      const first = e.find(x => x.isActive);
      if (first && !this.examId()) { this.examId.set(first.id); this.load(); }
    });
    this.preschool.overview().subscribe(o => {
      const active = o.classes.filter(c => c.isActive);
      this.classes.set(active);
      this.bands.set([...o.gradeBands].sort((a, b) => b.minPercent - a.minPercent));
      if (active.length && !this.classId()) { this.classId.set(active[0].id); this.load(); }
    });
  }

  load(): void {
    if (!this.examId() || !this.classId()) return;
    if (this.dirty() && !confirm('Your marks on this sheet are not saved. Leave them?')) return;
    this.marksApi.sheet(this.examId(), this.classId()).subscribe(sh => this.show(sh));
  }

  private show(sh: PreSchoolMarkSheet): void {
    this.sheet.set(sh);
    // The API leaves an empty mark out altogether, so "not there" and null both mean "not marked yet".
    const grid = sh.rows.map(r => r.marks.map(m => (m.isAbsent ? 'A' : m.marks == null ? '' : String(m.marks))));
    this.saved = grid.map(r => [...r]);
    this.cells.set(grid);
  }

  setCell(ri: number, si: number, value: string): void {
    const next = this.cells().map(r => [...r]);
    next[ri][si] = (value ?? '').trim().toUpperCase() === 'AB' ? 'A' : (value ?? '').trim().toUpperCase();
    this.cells.set(next);
  }

  isAbsent(ri: number, si: number): boolean { return this.cells()[ri]?.[si] === 'A'; }

  private parse(ri: number, si: number): { marks: number | null; absent: boolean; ok: boolean } {
    const v = this.cells()[ri]?.[si] ?? '';
    if (v === '') return { marks: null, absent: false, ok: true };
    if (v === 'A') return { marks: null, absent: true, ok: true };
    const n = Number(v);
    const max = this.sheet()?.subjects[si]?.maxMarks ?? 100;
    return { marks: Number.isFinite(n) ? n : null, absent: false, ok: Number.isFinite(n) && n >= 0 && n <= max };
  }

  valid(ri: number, si: number): boolean { return this.parse(ri, si).ok; }

  /** Total, percentage and grade from what is typed, the same way the server works them out. */
  summary(ri: number): { total: number; outOf: number; percent: number | null; grade: string | null } {
    const sh = this.sheet();
    if (!sh) return { total: 0, outOf: 0, percent: null, grade: null };
    let total = 0, outOf = 0;
    sh.subjects.forEach((s, si) => {
      const p = this.parse(ri, si);
      if (!p.ok) return;
      if (p.marks !== null) { total += p.marks; outOf += s.maxMarks; } else if (p.absent) outOf += s.maxMarks;
    });
    const percent = outOf > 0 ? Math.round((total * 1000) / outOf) / 10 : null;
    const grade = percent === null ? null : this.bands().find(b => percent >= b.minPercent)?.grade ?? null;
    return { total, outOf, percent, grade };
  }

  save(): void {
    const sh = this.sheet();
    if (!sh) return;
    const entries = [];
    for (let ri = 0; ri < sh.rows.length; ri++) {
      for (let si = 0; si < sh.subjects.length; si++) {
        const p = this.parse(ri, si);
        if (!p.ok) {
          this.warn(`${sh.rows[ri].childName}: ${sh.subjects[si].name} must be a number from 0 to ${sh.subjects[si].maxMarks}, or A for absent.`);
          return;
        }
        entries.push({ studentId: sh.rows[ri].studentId, subjectId: sh.subjects[si].id, marks: p.marks, isAbsent: p.absent });
      }
    }
    this.saving.set(true);
    this.marksApi.save(sh.examId, sh.classId, entries).subscribe({
      next: saved => { this.saving.set(false); this.show(saved); this.messages.add({ severity: 'success', summary: 'Marks saved', life: 2500 }); },
      error: () => this.saving.set(false)
    });
  }

  addExam(): void {
    const name = this.newExamName.trim();
    if (!name) { this.warn('Give the exam a name.'); return; }
    const sortOrder = Math.max(0, ...this.exams().map(e => e.sortOrder)) + 1;
    this.marksApi.saveExam(null, { name, heldOn: this.newExamDate || null, sortOrder, isActive: true }).subscribe(e => {
      this.exams.set([...this.exams(), e]);
      this.addingExam.set(false);
      this.newExamName = '';
      this.newExamDate = '';
      this.examId.set(e.id);
      this.load();
    });
  }

  private warn(detail: string): void { this.messages.add({ severity: 'warn', summary: 'Please check', detail, life: 5000 }); }
}
