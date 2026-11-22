import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { PreSchoolEnquiry, PreSchoolEnquirySave, emptyEnquiry, todayIso } from '../../../core/models/preschool.model';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { downloadSizedPdf, isNativeApp, pdfFileName } from '../../../core/printing/pdf-download';
import { currentSession, enquiryFormHtml } from '../../../core/printing/preschool-forms';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolEnquiryFormComponent } from '../../../shared/preschool-enquiry-form/preschool-enquiry-form.component';

/**
 * Admission enquiries: sent by parents from the website or the app, or typed
 * in by the office for a walk-in. Each prints as the school's two-page
 * Enquiry Form, the second page carrying the dated feedback notes. Separate
 * from the Computer Centre's course enquiries.
 */
@Component({
  selector: 'app-preschool-enquiries',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule, PreSchoolEnquiryFormComponent],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>Admission enquiries</h1>
      <p class="app-muted">From the website, the app and walk-ins. Call the family back, write down what was discussed, and print the Enquiry Form for the file.</p>
    </div>

    <div class="pse__bar">
      <p-button label="New enquiry" icon="pi pi-plus" (onClick)="openNew()" />
      <p-button label="Print blank form" icon="pi pi-print" [outlined]="true" (onClick)="printBlank()" />
      <label class="pse__toggle">
        <input type="checkbox" [ngModel]="showHandled()" (ngModelChange)="showHandled.set($event); load()" />
        Show enquiries already called back
      </label>
    </div>

    <div class="pse__list">
      @for (e of list(); track e.id) {
        <article class="app-card pse__item" [class.pse__item--done]="e.isHandled">
          <div class="pse__main">
            <strong>{{ e.childName }}</strong>
            <span class="app-muted">
              @if (e.classWanted) { for {{ e.classWanted }} · }
              @if (e.session) { session {{ e.session }} · }
              @if (e.childDateOfBirth) { born {{ e.childDateOfBirth | date: 'd MMM y' }} · }
              {{ e.createdOn | date: 'd MMM y, h:mm a' }} · {{ e.source ?? 'Website' }}
            </span>
            <span>{{ e.parentName }} · <a [href]="'tel:' + e.phone">{{ e.phone }}</a>
              @if (e.email) { · <a [href]="'mailto:' + e.email">{{ e.email }}</a> }</span>
            @if (e.message) { <p class="pse__msg">{{ e.message }}</p> }
            @if (e.feedback?.length) {
              <small class="app-muted">{{ e.feedback!.length }} feedback note(s) · last {{ e.feedback![e.feedback!.length - 1].feedbackOn | date: 'd MMM' }}</small>
            }
            @if (e.isHandled) { <small class="app-muted">Called back {{ e.handledOn | date: 'd MMM, h:mm a' }} by {{ e.handledBy }}</small> }
          </div>
          <div class="pse__actions">
            <a class="pse__wa" [href]="whatsApp(e)" target="_blank" rel="noopener" aria-label="WhatsApp the parent">
              <i class="pi pi-whatsapp" aria-hidden="true"></i></a>
            <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" ariaLabel="Open and add feedback" (onClick)="open(e)" />
            <p-button icon="pi pi-print" [text]="true" [rounded]="true" ariaLabel="Print the Enquiry Form" (onClick)="print(e)" />
            <p-button [label]="e.isHandled ? 'Reopen' : 'Called back'" [icon]="e.isHandled ? 'pi pi-undo' : 'pi pi-check'"
              size="small" [outlined]="e.isHandled" (onClick)="toggle(e)" />
          </div>
        </article>
      } @empty {
        @if (loaded()) { <p class="app-muted">No enquiries {{ showHandled() ? 'yet' : 'waiting for a call' }}.</p> }
      }
    </div>

    <p-dialog [(visible)]="editing" [modal]="true" [header]="current() ? 'Enquiry — ' + current()!.childName : 'New enquiry'"
      [style]="{ width: 'min(60rem, 96vw)' }" [dismissableMask]="true">
      @if (editing) {
        @if (current(); as c) {
          <section class="pse__fb">
            <h2>Enquiry Feedback</h2>
            @for (f of c.feedback ?? []; track f.id) {
              <div class="pse__fb-row">
                <span class="pse__fb-date">{{ f.feedbackOn | date: 'd MMM y' }}</span>
                <span class="pse__fb-note">{{ f.note }}@if (f.createdBy) { <small class="app-muted"> — {{ f.createdBy }}</small> }</span>
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" ariaLabel="Remove this note" (onClick)="removeNote(c, f.id)" />
              </div>
            } @empty { <p class="app-muted">No discussion written down yet.</p> }
            <div class="pse__fb-add">
              <label>Date <input type="date" [(ngModel)]="noteOn" [max]="today" /></label>
              <label class="pse__fb-text">Discussion &amp; Feedback
                <textarea rows="2" [(ngModel)]="noteText" maxlength="1000" placeholder="What the family asked, what was told, next step"></textarea></label>
              <p-button label="Add" icon="pi pi-plus" [loading]="savingNote()" (onClick)="addNote(c)" />
            </div>
            <p-button label="Print Enquiry Form" icon="pi pi-print" [outlined]="true" (onClick)="print(c)" />
          </section>
        }
        <app-preschool-enquiry-form [form]="form" [busy]="saving()" [submitLabel]="current() ? 'Save changes' : 'Save enquiry'"
          (submitted)="save($event)" />
      }
    </p-dialog>
  `,
  styles: [`
    .pse__bar { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: center; margin-bottom: 1rem; }
    .pse__toggle { display: inline-flex; gap: 0.45rem; align-items: center; font-size: 0.9rem; }
    .pse__list { display: flex; flex-direction: column; gap: 0.75rem; max-width: 56rem; }
    .pse__item { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
    .pse__item--done { opacity: 0.7; }
    .pse__main { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
    .pse__main strong { font-size: 1.05rem; }
    .pse__msg { margin: 0.35rem 0 0; white-space: pre-wrap; }
    .pse__actions { display: flex; gap: 0.35rem; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
    .pse__wa { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 50%; background: #25d366; color: #fff; text-decoration: none; }
    .pse__fb { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1.25rem; padding: 1rem; border: 1px solid #2c3e50; }
    .pse__fb h2 { margin: 0; font-size: 1.15rem; }
    .pse__fb-row { display: grid; grid-template-columns: 7rem minmax(0, 1fr) auto; gap: 0.75rem; align-items: start;
      padding-bottom: 0.5rem; border-bottom: 1px solid #e4e6ef; }
    .pse__fb-date { font-weight: 700; }
    .pse__fb-note { white-space: pre-wrap; }
    .pse__fb-add { display: flex; flex-wrap: wrap; gap: 0.6rem 0.9rem; align-items: flex-end; }
    .pse__fb-add label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 600; }
    .pse__fb-add input, .pse__fb-add textarea { font: inherit; padding: 0.45rem 0.55rem; border: 1px solid #c9cdd8; border-radius: 6px; }
    .pse__fb-text { flex: 1 1 18rem; }
    @media (max-width: 600px) {
      .pse__item { flex-direction: column; }
      .pse__fb-row { grid-template-columns: 1fr auto; }
      .pse__fb-date { grid-column: 1 / -1; }
    }
  `]
})
export class PreSchoolEnquiriesComponent implements OnInit {
  private readonly preschool = inject(PreSchoolService);
  private readonly messages = inject(MessageService);

  readonly list = signal<PreSchoolEnquiry[]>([]);
  readonly showHandled = signal(false);
  readonly loaded = signal(false);
  readonly current = signal<PreSchoolEnquiry | null>(null);
  readonly saving = signal(false);
  readonly savingNote = signal(false);
  readonly today = todayIso();

  editing = false;
  form: PreSchoolEnquirySave = emptyEnquiry(currentSession());
  noteOn = todayIso();
  noteText = '';

  ngOnInit(): void { this.load(); }

  load(): void {
    this.preschool.enquiries(this.showHandled()).subscribe(items => { this.list.set(items); this.loaded.set(true); });
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
    this.preschool.saveEnquiry(id, body).subscribe({
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
      this.messages.add({ severity: 'success', summary: e.isHandled ? 'Marked as open' : 'Marked as called back', life: 2500 });
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
