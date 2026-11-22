import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { PreSchoolEnquiry, PreSchoolEnquirySave, emptyEnquiry, todayIso } from '../../../core/models/preschool.model';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { downloadSizedPdf, isNativeApp, pdfFileName } from '../../../core/printing/pdf-download';
import { ENQUIRY_CLASSES, currentSession, enquiryFormHtml } from '../../../core/printing/preschool-forms';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolEnquiryFormComponent } from '../../../shared/preschool-enquiry-form/preschool-enquiry-form.component';

type StatusFilter = 'open' | 'done' | 'all';

/** One row of the list, with what the screen shows worked out once. */
interface Row {
  e: PreSchoolEnquiry;
  age: string;
  relation: string;
  initials: string;
  notes: number;
  lastNote: string | null;
  daysWaiting: number;
}

/**
 * Admission enquiries: sent by parents from the website or the app, or typed
 * in by the office for a walk-in. A summary on top, then a searchable list
 * the office works through: call or WhatsApp the family, write down what was
 * discussed, mark them called back, and print the school's two-page Enquiry
 * Form for the file. Separate from the Computer Centre's course enquiries.
 */
@Component({
  selector: 'app-preschool-enquiries',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, PreSchoolEnquiryFormComponent],
  template: `
    <header class="pe-head">
      <div>
        <span class="app-eyebrow">Avijan PreSchool</span>
        <h1>Admission enquiries</h1>
        <p class="app-muted">From the website, the app and walk-ins. Call the family, note what was discussed, and print the Enquiry Form for the file.</p>
      </div>
      <div class="pe-head__actions">
        <p-button label="Print blank form" icon="pi pi-print" [outlined]="true" (onClick)="printBlank()" />
        <p-button label="New enquiry" icon="pi pi-plus" (onClick)="openNew()" />
      </div>
    </header>

    <section class="pe-stats" aria-label="Summary">
      <button type="button" class="pe-stat pe-stat--warn" [class.pe-stat--on]="status() === 'open'" (click)="status.set('open')">
        <span class="pe-stat__num">{{ counts().open }}</span><span class="pe-stat__label">Waiting for a call</span>
      </button>
      <button type="button" class="pe-stat pe-stat--ok" [class.pe-stat--on]="status() === 'done'" (click)="status.set('done')">
        <span class="pe-stat__num">{{ counts().done }}</span><span class="pe-stat__label">Called back</span>
      </button>
      <div class="pe-stat">
        <span class="pe-stat__num">{{ counts().thisMonth }}</span><span class="pe-stat__label">This month</span>
      </div>
      <button type="button" class="pe-stat" [class.pe-stat--on]="status() === 'all'" (click)="status.set('all')">
        <span class="pe-stat__num">{{ counts().all }}</span><span class="pe-stat__label">All enquiries</span>
      </button>
    </section>

    <section class="pe-card">
      <div class="pe-tools">
        <label class="pe-search">
          <i class="pi pi-search" aria-hidden="true"></i>
          <span class="pe-sr">Search enquiries</span>
          <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search child, parent or phone" />
        </label>
        <div class="pe-chips" role="group" aria-label="Filter by class">
          <button type="button" class="pe-chip" [class.pe-chip--on]="klass() === null" (click)="klass.set(null)">All classes</button>
          @for (c of classes; track c) {
            <button type="button" class="pe-chip" [class.pe-chip--on]="klass() === c" (click)="klass.set(c)">{{ c }}</button>
          }
        </div>
        <div class="pe-seg" role="group" aria-label="Filter by status">
          <button type="button" [class.on]="status() === 'open'" (click)="status.set('open')">Waiting</button>
          <button type="button" [class.on]="status() === 'done'" (click)="status.set('done')">Called back</button>
          <button type="button" [class.on]="status() === 'all'" (click)="status.set('all')">All</button>
        </div>
      </div>

      <div class="pe-table" role="table" aria-label="Enquiries">
        <div class="pe-tr pe-tr--head" role="row">
          <span role="columnheader">Child</span>
          <span role="columnheader">Class</span>
          <span role="columnheader">Contact</span>
          <span role="columnheader">Received</span>
          <span role="columnheader">Follow-up</span>
          <span role="columnheader">Status</span>
          <span role="columnheader" class="pe-right">Actions</span>
        </div>

        @for (r of rows(); track r.e.id) {
          <div class="pe-tr" role="row" [class.pe-tr--done]="r.e.isHandled">
            <div class="pe-child" role="cell">
              <span class="pe-avatar" aria-hidden="true">{{ r.initials }}</span>
              <div>
                <button type="button" class="pe-link" (click)="open(r.e)">{{ r.e.childName }}</button>
                <small>{{ r.e.gender ?? '' }}@if (r.e.gender && r.age) { · }{{ r.age }}</small>
              </div>
            </div>
            <div role="cell">
              @if (r.e.classWanted) { <span class="pe-class">{{ r.e.classWanted }}</span> } @else { <span class="app-muted">—</span> }
              @if (r.e.session) { <small>Session {{ r.e.session }}</small> }
            </div>
            <div class="pe-contact" role="cell">
              <strong>{{ r.e.parentName }}</strong>@if (r.relation) { <small> · {{ r.relation }}</small> }
              <a [href]="'tel:' + r.e.phone"><i class="pi pi-phone" aria-hidden="true"></i> {{ r.e.phone }}</a>
              @if (r.e.email) { <a class="pe-mail" [href]="'mailto:' + r.e.email">{{ r.e.email }}</a> }
            </div>
            <div role="cell">
              {{ r.e.createdOn | date: 'd MMM y' }}
              <small>{{ r.e.createdOn | date: 'h:mm a' }} · {{ r.e.source ?? 'Website' }}</small>
            </div>
            <div class="pe-follow" role="cell">
              @if (r.notes) {
                <span>{{ r.notes }} note{{ r.notes === 1 ? '' : 's' }}</span>
                <small [title]="r.lastNote ?? ''">{{ r.lastNote }}</small>
              } @else {
                <small class="app-muted">No notes yet</small>
              }
            </div>
            <div role="cell">
              @if (r.e.isHandled) {
                <span class="pe-badge pe-badge--ok">Called back</span>
                <small>{{ r.e.handledOn | date: 'd MMM' }}@if (r.e.handledBy) { · {{ r.e.handledBy }} }</small>
              } @else {
                <span class="pe-badge" [class.pe-badge--late]="r.daysWaiting >= 2">{{ r.daysWaiting >= 2 ? 'Waiting ' + r.daysWaiting + ' days' : 'New' }}</span>
              }
            </div>
            <div class="pe-actions" role="cell">
              <a class="pe-icon pe-icon--wa" [href]="whatsApp(r.e)" target="_blank" rel="noopener" [attr.aria-label]="'WhatsApp ' + r.e.parentName" title="WhatsApp">
                <i class="pi pi-whatsapp" aria-hidden="true"></i></a>
              <button type="button" class="pe-icon" (click)="open(r.e)" aria-label="Open, edit and add feedback" title="Open / feedback">
                <i class="pi pi-pencil" aria-hidden="true"></i></button>
              <button type="button" class="pe-icon" (click)="print(r.e)" aria-label="Print the Enquiry Form" title="Print Enquiry Form">
                <i class="pi pi-print" aria-hidden="true"></i></button>
              <button type="button" class="pe-mark" [class.pe-mark--undo]="r.e.isHandled" (click)="toggle(r.e)">
                <i class="pi" [class.pi-check]="!r.e.isHandled" [class.pi-undo]="r.e.isHandled" aria-hidden="true"></i>
                {{ r.e.isHandled ? 'Reopen' : 'Called back' }}</button>
            </div>
          </div>
        } @empty {
          @if (loaded()) {
            <div class="pe-empty">
              <i class="pi pi-inbox" aria-hidden="true"></i>
              <p>{{ emptyText() }}</p>
            </div>
          }
        }
      </div>
    </section>

    <p-dialog [(visible)]="editing" [modal]="true" [header]="current() ? 'Enquiry — ' + current()!.childName : 'New enquiry'"
      [style]="{ width: 'min(60rem, 96vw)' }" [dismissableMask]="true">
      @if (editing) {
        @if (current(); as c) {
          <section class="pe-fb">
            <div class="pe-fb__head">
              <h2>Enquiry Feedback</h2>
              <p-button label="Print Enquiry Form" icon="pi pi-print" [outlined]="true" size="small" (onClick)="print(c)" />
            </div>
            @for (f of c.feedback ?? []; track f.id) {
              <div class="pe-fb__row">
                <span class="pe-fb__date">{{ f.feedbackOn | date: 'd MMM y' }}</span>
                <span class="pe-fb__note">{{ f.note }}@if (f.createdBy) { <small class="app-muted"> — {{ f.createdBy }}</small> }</span>
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" ariaLabel="Remove this note" (onClick)="removeNote(c, f.id)" />
              </div>
            } @empty { <p class="app-muted">No discussion written down yet.</p> }
            <div class="pe-fb__add">
              <label>Date <input type="date" [(ngModel)]="noteOn" [max]="today" /></label>
              <label class="pe-fb__text">Discussion &amp; Feedback
                <textarea rows="2" [(ngModel)]="noteText" maxlength="1000" placeholder="What the family asked, what was told, next step"></textarea></label>
              <p-button label="Add note" icon="pi pi-plus" [loading]="savingNote()" (onClick)="addNote(c)" />
            </div>
          </section>
        }
        <app-preschool-enquiry-form [form]="form" [busy]="saving()" [submitLabel]="current() ? 'Save changes' : 'Save enquiry'"
          (submitted)="save($event)" />
      }
    </p-dialog>
  `,
  styles: [`
    :host { --pe-line: #e6e8ef; --pe-ink: #1f2433; --pe-soft: #6b7088; --pe-brand: #0e9f6e; display: block; }
    .pe-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 1rem; margin-bottom: 1.25rem; }
    .pe-head h1 { margin: 0.15rem 0 0.3rem; }
    .pe-head p { margin: 0; max-width: 46rem; }
    .pe-head__actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }

    .pe-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.9rem; margin-bottom: 1.1rem; }
    .pe-stat { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.9rem 1.1rem; border: 1px solid var(--pe-line); border-radius: 14px;
      background: #fff; text-align: left; font: inherit; color: var(--pe-ink); }
    button.pe-stat { cursor: pointer; }
    button.pe-stat:hover { border-color: #c9cede; }
    .pe-stat--on { border-color: var(--pe-brand); box-shadow: 0 0 0 1px var(--pe-brand); }
    .pe-stat__num { font-size: 1.7rem; font-weight: 800; line-height: 1.1; }
    .pe-stat__label { font-size: 0.82rem; color: var(--pe-soft); font-weight: 600; }
    .pe-stat--warn .pe-stat__num { color: #b45309; }
    .pe-stat--ok .pe-stat__num { color: var(--pe-brand); }

    .pe-card { background: #fff; border: 1px solid var(--pe-line); border-radius: 16px; overflow: hidden; }
    .pe-tools { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: center; padding: 0.9rem 1.1rem; border-bottom: 1px solid var(--pe-line); background: #fafbfd; }
    .pe-search { position: relative; flex: 1 1 16rem; max-width: 24rem; }
    .pe-search i { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--pe-soft); font-size: 0.9rem; }
    .pe-search input { width: 100%; box-sizing: border-box; padding: 0.6rem 0.75rem 0.6rem 2.2rem; border: 1px solid #d5d8e3; border-radius: 10px;
      font: inherit; background: #fff; min-height: 2.6rem; }
    .pe-search input:focus { outline: 2px solid var(--pe-brand); outline-offset: 0; border-color: transparent; }
    .pe-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .pe-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .pe-chip { min-height: 2.2rem; padding: 0.3rem 0.8rem; border: 1px solid #d5d8e3; border-radius: 999px; background: #fff;
      font-family: inherit; font-weight: 600; font-size: 0.82rem; color: var(--pe-ink); cursor: pointer; }
    .pe-chip--on { background: var(--pe-ink); border-color: var(--pe-ink); color: #fff; }
    .pe-seg { display: inline-flex; margin-left: auto; border: 1px solid #d5d8e3; border-radius: 10px; overflow: hidden; }
    .pe-seg button { min-height: 2.4rem; padding: 0.3rem 0.85rem; border: 0; background: #fff; font-family: inherit; font-weight: 600; font-size: 0.82rem; color: var(--pe-soft); cursor: pointer; }
    .pe-seg button + button { border-left: 1px solid #d5d8e3; }
    .pe-seg button.on { background: #ecfdf5; color: #065f46; }

    .pe-table { display: flex; flex-direction: column; }
    .pe-tr { display: grid; grid-template-columns: minmax(11rem, 1.3fr) 7.5rem minmax(12rem, 1.4fr) 7.5rem minmax(9rem, 1.1fr) 8.5rem 12.5rem;
      gap: 0.9rem; align-items: center; padding: 0.85rem 1.1rem; border-bottom: 1px solid var(--pe-line); font-size: 0.9rem; color: var(--pe-ink); }
    .pe-tr:last-child { border-bottom: 0; }
    .pe-tr:not(.pe-tr--head):hover { background: #fafbfd; }
    .pe-tr--head { padding-top: 0.6rem; padding-bottom: 0.6rem; background: #f5f6fa; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--pe-soft); }
    .pe-tr--done { color: #4b5163; }
    .pe-tr small { display: block; color: var(--pe-soft); font-size: 0.78rem; margin-top: 0.1rem; }
    .pe-right { text-align: right; }
    .pe-child { display: flex; gap: 0.7rem; align-items: center; min-width: 0; }
    .pe-avatar { flex: 0 0 auto; display: grid; place-items: center; width: 2.4rem; height: 2.4rem; border-radius: 50%;
      background: #e0f2fe; color: #075985; font-weight: 800; font-size: 0.85rem; }
    .pe-link { padding: 0; border: 0; background: none; font-family: inherit; font-weight: 700; font-size: 0.95rem; color: var(--pe-ink); cursor: pointer; text-align: left; }
    .pe-link:hover { color: var(--pe-brand); text-decoration: underline; }
    .pe-class { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 6px; background: #f3e8ff; color: #6b21a8; font-weight: 700; font-size: 0.8rem; }
    .pe-contact { display: flex; flex-direction: column; min-width: 0; }
    .pe-contact strong small { display: inline; }
    .pe-contact a { color: #1d4ed8; text-decoration: none; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pe-contact a:hover { text-decoration: underline; }
    .pe-contact a i { font-size: 0.75rem; }
    .pe-follow { min-width: 0; }
    .pe-follow small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pe-badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; background: #e0f2fe; color: #075985; font-weight: 700; font-size: 0.76rem; }
    .pe-badge--late { background: #fef3c7; color: #92400e; }
    .pe-badge--ok { background: #d1fae5; color: #065f46; }
    .pe-actions { display: flex; gap: 0.35rem; justify-content: flex-end; align-items: center; }
    .pe-icon { display: grid; place-items: center; width: 2.4rem; height: 2.4rem; border-radius: 10px; border: 1px solid #d5d8e3; background: #fff;
      color: #374151; cursor: pointer; text-decoration: none; }
    .pe-icon:hover { border-color: #9ca3af; background: #f9fafb; }
    .pe-icon--wa { color: #128c4a; }
    .pe-mark { display: inline-flex; align-items: center; gap: 0.35rem; min-height: 2.4rem; padding: 0 0.75rem; border-radius: 10px; border: 0;
      background: var(--pe-brand); color: #fff; font-family: inherit; font-weight: 700; font-size: 0.8rem; cursor: pointer; white-space: nowrap; }
    .pe-mark--undo { background: #fff; color: #374151; border: 1px solid #d5d8e3; }
    .pe-empty { padding: 2.5rem 1rem; text-align: center; color: var(--pe-soft); }
    .pe-empty i { font-size: 2rem; }
    .pe-empty p { margin: 0.5rem 0 0; }

    .pe-fb { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1.25rem; padding: 1rem; border: 1px solid var(--pe-line); border-radius: 12px; background: #fafbfd; }
    .pe-fb__head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .pe-fb h2 { margin: 0; font-size: 1.05rem; }
    .pe-fb__row { display: grid; grid-template-columns: 7rem minmax(0, 1fr) auto; gap: 0.75rem; align-items: start;
      padding-bottom: 0.5rem; border-bottom: 1px solid var(--pe-line); }
    .pe-fb__date { font-weight: 700; }
    .pe-fb__note { white-space: pre-wrap; }
    .pe-fb__add { display: flex; flex-wrap: wrap; gap: 0.6rem 0.9rem; align-items: flex-end; }
    .pe-fb__add label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 600; }
    .pe-fb__add input, .pe-fb__add textarea { font: inherit; padding: 0.45rem 0.55rem; border: 1px solid #c9cdd8; border-radius: 8px; background: #fff; }
    .pe-fb__text { flex: 1 1 18rem; }

    @media (max-width: 1200px) {
      .pe-tr--head { display: none; }
      .pe-tr { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.6rem 1rem; padding: 1rem 1.1rem; }
      .pe-child, .pe-actions { grid-column: 1 / -1; }
      .pe-actions { justify-content: flex-start; flex-wrap: wrap; padding-top: 0.3rem; }
    }
    @media (max-width: 760px) {
      .pe-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .pe-seg { margin-left: 0; }
    }
    @media (max-width: 480px) {
      .pe-tr { grid-template-columns: minmax(0, 1fr); }
      .pe-fb__row { grid-template-columns: 1fr auto; }
      .pe-fb__date { grid-column: 1 / -1; }
    }
  `]
})
export class PreSchoolEnquiriesComponent implements OnInit {
  private readonly preschool = inject(PreSchoolService);
  private readonly messages = inject(MessageService);

  readonly classes = ENQUIRY_CLASSES;
  readonly list = signal<PreSchoolEnquiry[]>([]);
  readonly loaded = signal(false);
  readonly status = signal<StatusFilter>('open');
  readonly klass = signal<string | null>(null);
  readonly query = signal('');
  readonly current = signal<PreSchoolEnquiry | null>(null);
  readonly saving = signal(false);
  readonly savingNote = signal(false);
  readonly today = todayIso();

  editing = false;
  form: PreSchoolEnquirySave = emptyEnquiry(currentSession());
  noteOn = todayIso();
  noteText = '';

  readonly counts = computed(() => {
    const all = this.list();
    const month = this.today.slice(0, 7);
    return {
      all: all.length,
      open: all.filter(e => !e.isHandled).length,
      done: all.filter(e => e.isHandled).length,
      thisMonth: all.filter(e => e.createdOn.slice(0, 7) === month).length
    };
  });

  readonly rows = computed<Row[]>(() => {
    const q = this.query().trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const status = this.status();
    const klass = this.klass();
    return this.list()
      .filter(e => status === 'all' || (status === 'open') === !e.isHandled)
      .filter(e => !klass || (e.classWanted ?? '').toLowerCase() === klass.toLowerCase())
      .filter(e => !q || [e.childName, e.parentName, e.motherName, e.fatherName, e.guardianName, e.email]
        .some(v => (v ?? '').toLowerCase().includes(q)) || (digits.length >= 3 && e.phone.replace(/\D/g, '').includes(digits)))
      .map(e => toRow(e, this.today));
  });

  readonly emptyText = computed(() => {
    if (this.list().length === 0) return 'No enquiries yet. They appear here as soon as a family sends one.';
    if (this.query() || this.klass()) return 'Nothing matches the search or class filter.';
    return this.status() === 'open' ? 'Every enquiry has been called back.' : 'No enquiries called back yet.';
  });

  ngOnInit(): void { this.load(); }

  /** Everything, called back or not: the counts and filters work on the whole list. */
  load(): void {
    this.preschool.enquiries(true).subscribe(items => { this.list.set(items); this.loaded.set(true); });
  }

  openNew(): void {
    this.current.set(null);
    this.form = emptyEnquiry(currentSession());
    this.editing = true;
  }

  open(e: PreSchoolEnquiry): void {
    this.current.set(e);
    this.form = toForm(e);
    this.noteOn = todayIso();
    this.noteText = '';
    this.editing = true;
  }

  save(body: PreSchoolEnquirySave): void {
    const id = this.current()?.id ?? null;
    this.saving.set(true);
    this.preschool.saveEnquiry(id, { ...body, source: 'Office' }).subscribe({
      next: saved => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: id ? 'Enquiry saved' : 'Enquiry added', life: 2500 });
        this.current.set(saved);
        this.form = toForm(saved);
        this.load();
      },
      error: () => this.saving.set(false)
    });
  }

  addNote(e: PreSchoolEnquiry): void {
    if (!this.noteText.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Please check', detail: 'Write what was discussed.', life: 3500 });
      return;
    }
    this.savingNote.set(true);
    this.preschool.addEnquiryFeedback(e.id, this.noteOn || null, this.noteText.trim()).subscribe({
      next: saved => {
        this.savingNote.set(false);
        this.current.set(saved);
        this.noteText = '';
        this.load();
      },
      error: () => this.savingNote.set(false)
    });
  }

  removeNote(e: PreSchoolEnquiry, feedbackId: number): void {
    if (!confirm('Remove this feedback note?')) return;
    this.preschool.deleteEnquiryFeedback(e.id, feedbackId).subscribe(saved => { this.current.set(saved); this.load(); });
  }

  toggle(e: PreSchoolEnquiry): void {
    this.preschool.setEnquiryHandled(e.id, !e.isHandled).subscribe(() => {
      this.messages.add({ severity: 'success', summary: e.isHandled ? 'Marked as waiting' : 'Marked as called back', life: 2500 });
      this.load();
    });
  }

  /** The filled-in Enquiry Form, both pages, fetched fresh so the latest notes are on it. */
  print(e: PreSchoolEnquiry): void {
    if (isNativeApp()) {
      this.preschool.enquiry(e.id).subscribe(full => this.savePdf(full));
      return;
    }
    const win = openPendingDocumentWindow(860, 980);
    this.preschool.enquiry(e.id).subscribe({
      next: full => this.show(win, enquiryFormHtml(full)),
      error: () => win?.close()
    });
  }

  /** The empty form, for a parent to fill in by hand at the desk. */
  printBlank(): void {
    if (isNativeApp()) { this.savePdf(null); return; }
    this.show(openPendingDocumentWindow(860, 980), enquiryFormHtml(null));
  }

  /** In the app, where there is no print window: the form as an A4 PDF, to share or print from the phone. */
  private savePdf(q: PreSchoolEnquiry | null): void {
    const name = pdfFileName('EnquiryForm', q?.id ?? 'blank', q?.childName);
    downloadSizedPdf([enquiryFormHtml(q, 1), enquiryFormHtml(q, 2)], name, { width: 794, format: 'a4' })
      .catch(() => this.messages.add({ severity: 'warn', summary: 'The PDF could not be made', detail: 'Please try again.', life: 4000 }));
  }

  /** A WhatsApp chat with the parent; Indian numbers without a country code get 91. */
  whatsApp(e: PreSchoolEnquiry): string {
    const digits = e.phone.replace(/\D/g, '');
    const number = digits.length === 10 ? `91${digits}` : digits;
    const text = `Hello ${e.parentName}, thank you for your enquiry about ${e.childName} at Avijan PreSchool.`;
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  }

  private show(win: Window | null, html: string): void {
    if (!writeDocumentWindow(win, html)) {
      this.messages.add({ severity: 'warn', summary: 'Pop-up blocked', detail: 'Allow pop-ups for this site, then print again.', life: 4500 });
    }
  }
}

function toRow(e: PreSchoolEnquiry, today: string): Row {
  const notes = e.feedback ?? [];
  const last = notes.length ? notes[notes.length - 1] : null;
  const name = e.parentName?.trim().toLowerCase();
  const relation = name && name === e.motherName?.trim().toLowerCase() ? 'Mother'
    : name && name === e.fatherName?.trim().toLowerCase() ? 'Father'
    : name && name === e.guardianName?.trim().toLowerCase() ? 'Guardian' : '';
  const words = e.childName.trim().split(/\s+/);
  const initials = ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  const waited = Math.floor((Date.parse(today) - Date.parse(e.createdOn.slice(0, 10))) / 86_400_000);
  return {
    e, relation, initials, notes: notes.length,
    lastNote: last ? last.note : null,
    age: ageText(e.childDateOfBirth ?? null, today),
    daysWaiting: Math.max(0, waited)
  };
}

/** "3 yrs 4 mths" today, from a "yyyy-MM-dd" birthday. */
function ageText(dob: string | null, today: string): string {
  if (!dob) return '';
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 0) return '';
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} yr${y === 1 ? '' : 's'}` : '', m ? `${m} mth${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ') || 'under 1 mth';
}

/** An enquiry back into the form's shape; an old short enquiry's parent (relation unknown) goes in as the guardian. */
function toForm(e: PreSchoolEnquiry): PreSchoolEnquirySave {
  const f = emptyEnquiry(e.session ?? null);
  const pick = <K extends keyof PreSchoolEnquirySave>(k: K) => (e[k as keyof PreSchoolEnquiry] ?? f[k]) as PreSchoolEnquirySave[K];
  const out: PreSchoolEnquirySave = {
    ...f,
    childName: e.childName,
    childDateOfBirth: e.childDateOfBirth ?? null,
    classWanted: e.classWanted ?? null,
    gender: e.gender ?? null,
    motherName: pick('motherName'), motherOccupation: pick('motherOccupation'), motherPhone: pick('motherPhone'),
    motherEmail: pick('motherEmail'), motherAddress: pick('motherAddress'),
    fatherName: pick('fatherName'), fatherOccupation: pick('fatherOccupation'), fatherPhone: pick('fatherPhone'),
    fatherEmail: pick('fatherEmail'), fatherAddress: pick('fatherAddress'),
    guardianName: pick('guardianName'), guardianOccupation: pick('guardianOccupation'), guardianPhone: pick('guardianPhone'),
    guardianAddress: pick('guardianAddress'),
    heardFrom: [...(e.heardFrom ?? [])],
    message: e.message ?? null,
    email: e.email ?? null
  };
  if (!out.motherName && !out.fatherName && !out.guardianName) {
    out.guardianName = e.parentName;
    out.guardianPhone = e.phone.replace(/\D/g, '').slice(-10);
  }
  return out;
}
