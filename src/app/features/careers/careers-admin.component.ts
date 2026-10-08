import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { BranchLookup } from '../../core/models/student.model';
import {
  AVIJAN_FACEBOOK, AVIJAN_INSTAGRAM, CAREERS_URL, JobApplication, JobApplicationStatus, Vacancy, VacancySave, shiftLabel
} from '../../core/models/career.model';
import { CareerService } from '../../core/services/career.service';
import { StudentService } from '../../core/services/student.service';

interface VacancyForm {
  id: number | null;
  title: string;
  branch: string | null;
  shiftName: string;
  shiftStart: Date | null;
  shiftEnd: Date | null;
  workingDays: string;
  qualification: string;
  experience: string;
  salary: string;
  description: string;
  openings: number;
  closesOn: Date | null;
  isActive: boolean;
}

const STATUSES: JobApplicationStatus[] = ['New', 'Shortlisted', 'Interviewed', 'Hired', 'Rejected'];

/**
 * Careers, Admin's and Editor's side: Receptionist vacancies per branch (shift
 * timing, academic criteria), and the applications that come in from the
 * public careers page — with the CV and photograph to download.
 */
@Component({
  selector: 'app-careers-admin',
  standalone: true,
  imports: [
    DatePipe, FormsModule, ButtonModule, ConfirmDialogModule, DatePickerModule, DialogModule, InputNumberModule,
    InputTextModule, SelectModule, TableModule, TagModule, TextareaModule, ToggleSwitchModule
  ],
  providers: [ConfirmationService],
  template: `
    <div class="app-page-head ca__head">
      <div>
        <span class="app-eyebrow">Careers</span>
        <h1>Vacancies &amp; applications</h1>
        <p class="app-muted">Open a Receptionist vacancy for a branch and it appears on
          <a [href]="careersUrl" target="_blank" rel="noopener">avijan.in/careers</a> — share that link on
          <a [href]="instagram" target="_blank" rel="noopener">Instagram</a> and
          <a [href]="facebook" target="_blank" rel="noopener">Facebook</a>.</p>
      </div>
      <p-button label="New vacancy" icon="pi pi-plus" (onClick)="openNew()" />
    </div>

    <section class="app-card ca__section">
      <h2>Vacancies</h2>
      <p-table [value]="vacancies()" [loading]="loadingVacancies()" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr><th>Post &amp; branch</th><th>Shift</th><th>Qualification</th><th style="width:7rem">Closes</th>
            <th style="width:8rem">Applications</th><th style="width:7rem">Status</th><th style="width:7.5rem"></th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-v>
          <tr>
            <td><strong>{{ v.title }}</strong><div class="app-muted ca__sub">{{ v.branch }} · {{ v.openings }} {{ v.openings === 1 ? 'post' : 'posts' }}</div></td>
            <td class="ca__sub">{{ shift(v) || '—' }}@if (v.workingDays) { <div class="app-muted">{{ v.workingDays }}</div> }</td>
            <td class="ca__sub">{{ v.qualification }}</td>
            <td class="ca__sub">{{ v.closesOn ? (v.closesOn | date: 'd MMM y') : 'Until filled' }}</td>
            <td>
              <button type="button" class="ca__count" (click)="filterTo(v.id)">
                {{ v.applications }} @if (v.newApplications) { <p-tag [value]="v.newApplications + ' new'" severity="danger" /> }
              </button>
            </td>
            <td><p-tag [value]="v.isActive ? 'Open' : 'Closed'" [severity]="v.isActive ? 'success' : 'secondary'" /></td>
            <td class="ca__row-actions">
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" (onClick)="openEdit(v)" ariaLabel="Edit" />
              <p-button icon="pi pi-share-alt" [text]="true" [rounded]="true" (onClick)="copyLink(v)" ariaLabel="Copy link" />
              <p-button icon="pi pi-trash" severity="danger" [text]="true" [rounded]="true" (onClick)="remove(v)" ariaLabel="Delete" />
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="7" class="app-muted">No vacancies yet — add one with “New vacancy”.</td></tr></ng-template>
      </p-table>
    </section>

    <section class="app-card ca__section">
      <div class="ca__apps-head">
        <h2>Applications</h2>
        <p-select [options]="vacancyFilterOptions()" [ngModel]="filterVacancy()" (ngModelChange)="filterTo($event)"
                  optionLabel="label" optionValue="value" appendTo="body" styleClass="ca__filter" />
      </div>
      <p-table [value]="applications()" [loading]="loadingApps()" styleClass="p-datatable-sm" [paginator]="applications().length > 20" [rows]="20">
        <ng-template pTemplate="header">
          <tr><th style="width:4rem"></th><th>Applicant</th><th>Applied for</th><th>Qualification &amp; experience</th>
            <th style="width:7rem">Applied</th><th style="width:10rem">Status</th><th style="width:6rem">CV</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-a>
          <tr [class.ca__new]="a.status === 'New'">
            <td>
              @if (photos()[a.id]; as src) { <img class="ca__photo" [src]="src" [alt]="a.name" (click)="openPhoto(a)" /> }
              @else { <button type="button" class="ca__photo ca__photo--load" (click)="loadPhoto(a)" title="Show photo"><i class="pi pi-user"></i></button> }
            </td>
            <td>
              <strong>{{ a.name }}</strong>
              <div class="ca__sub"><a [href]="'tel:' + a.phone">{{ a.phone }}</a>@if (a.email) { · <a [href]="'mailto:' + a.email">{{ a.email }}</a> }</div>
              @if (a.address) { <div class="app-muted ca__sub">{{ a.address }}</div> }
              @if (a.message) { <div class="ca__msg">“{{ a.message }}”</div> }
            </td>
            <td class="ca__sub">{{ a.vacancyTitle }}<div class="app-muted">{{ a.branch }}</div></td>
            <td class="ca__sub">{{ a.qualification }}@if (a.experience) { <div class="app-muted">{{ a.experience }}</div> }</td>
            <td class="ca__sub">{{ a.appliedOn | date: 'd MMM y' }}<div class="app-muted">{{ a.appliedOn | date: 'h:mm a' }}</div></td>
            <td>
              <p-select [options]="statuses" [ngModel]="a.status" (ngModelChange)="setStatus(a, $event)" appendTo="body" styleClass="ca__status" />
              @if (a.adminNote) { <div class="app-muted ca__sub">{{ a.adminNote }}</div> }
              <button type="button" class="ca__link" (click)="editNote(a)">{{ a.adminNote ? 'Edit note' : 'Add note' }}</button>
            </td>
            <td><p-button icon="pi pi-download" label="CV" size="small" [text]="true" (onClick)="downloadCv(a)" /></td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage"><tr><td colspan="7" class="app-muted">No applications yet.</td></tr></ng-template>
      </p-table>
    </section>

    <!-- vacancy form -->
    <p-dialog [header]="form().id ? 'Edit vacancy' : 'New vacancy'" [visible]="dialogOpen()" (visibleChange)="dialogOpen.set($event)"
              [modal]="true" [style]="{ width: 'min(40rem, 96vw)' }" appendTo="body">
      <div class="ca__form">
        <label>Post<input pInputText [(ngModel)]="form().title" maxlength="100" /></label>
        <label><span>Branch <em>*</em></span>
          <p-select [options]="branches()" [(ngModel)]="form().branch" optionLabel="name" optionValue="name" placeholder="Choose branch" appendTo="body" />
        </label>
        <label>Shift name<input pInputText [(ngModel)]="form().shiftName" placeholder="Morning / Evening" maxlength="50" /></label>
        <label>Working days<input pInputText [(ngModel)]="form().workingDays" placeholder="Monday to Saturday" maxlength="100" /></label>
        <label>Shift starts<p-datepicker [(ngModel)]="form().shiftStart" [timeOnly]="true" hourFormat="12" appendTo="body" /></label>
        <label>Shift ends<p-datepicker [(ngModel)]="form().shiftEnd" [timeOnly]="true" hourFormat="12" appendTo="body" /></label>
        <label class="ca__wide"><span>Academic qualification required <em>*</em></span>
          <input pInputText [(ngModel)]="form().qualification" placeholder="e.g. Graduate (any stream), basic computer knowledge" maxlength="300" /></label>
        <label>Experience<input pInputText [(ngModel)]="form().experience" placeholder="Freshers welcome" maxlength="200" /></label>
        <label>Salary<input pInputText [(ngModel)]="form().salary" placeholder="e.g. ₹8,000 – ₹10,000 / month" maxlength="100" /></label>
        <label>Number of posts<p-inputnumber [(ngModel)]="form().openings" [min]="1" [max]="50" [showButtons]="true" /></label>
        <label>Applications close on<p-datepicker [(ngModel)]="form().closesOn" dateFormat="dd/mm/yy" [showIcon]="true" [showClear]="true" appendTo="body" /></label>
        <label class="ca__wide">Description<textarea pTextarea rows="3" [(ngModel)]="form().description" maxlength="2000"
          placeholder="Duties, what you are looking for…"></textarea></label>
        <label class="ca__switch"><p-toggleswitch [(ngModel)]="form().isActive" /> Show on the website (open)</label>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" [text]="true" severity="secondary" (onClick)="dialogOpen.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <!-- note -->
    <p-dialog header="Note" [visible]="!!noteFor()" (visibleChange)="$event || noteFor.set(null)" [modal]="true"
              [style]="{ width: 'min(28rem, 96vw)' }" appendTo="body">
      <textarea pTextarea rows="3" class="ca__note" [(ngModel)]="noteText" maxlength="500" placeholder="e.g. Interview on Monday 11 AM"></textarea>
      <ng-template pTemplate="footer">
        <p-button label="Save note" icon="pi pi-check" (onClick)="saveNote()" />
      </ng-template>
    </p-dialog>

    <!-- photo -->
    <p-dialog [header]="photoFor()?.name ?? ''" [visible]="!!photoFor()" (visibleChange)="$event || photoFor.set(null)" [modal]="true"
              [dismissableMask]="true" appendTo="body">
      @if (photoFor(); as a) { <img class="ca__photo-big" [src]="photos()[a.id]" [alt]="a.name" /> }
    </p-dialog>

    <p-confirmdialog />
  `,
  styles: [`
    .ca__head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-end; }
    .ca__section { margin-bottom: 1.25rem; }
    .ca__section h2 { margin: 0 0 0.75rem; font-size: 1.1rem; }
    .ca__apps-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
    .ca__apps-head h2 { margin: 0; }
    .ca__sub { font-size: 0.85rem; }
    .ca__msg { font-size: 0.82rem; font-style: italic; color: var(--app-text-muted, #66708a); margin-top: 0.2rem; }
    .ca__count { border: 0; background: none; font: inherit; font-weight: 700; cursor: pointer; display: inline-flex; gap: 0.4rem; align-items: center; color: var(--p-primary-color); }
    .ca__row-actions { white-space: nowrap; }
    .ca__new td { background: color-mix(in srgb, var(--p-primary-color) 6%, transparent); }
    .ca__photo { width: 3rem; height: 3rem; border-radius: 8px; object-fit: cover; cursor: pointer; border: 1px solid var(--app-border); }
    .ca__photo--load { display: grid; place-items: center; background: var(--app-page-bg, #f2f4f8); }
    .ca__photo-big { max-width: min(80vw, 28rem); max-height: 70vh; border-radius: 10px; display: block; }
    .ca__link { border: 0; background: none; padding: 0; font: inherit; font-size: 0.8rem; color: var(--p-primary-color); cursor: pointer; }
    .ca__form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .ca__form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
    .ca__form em { color: #b42318; font-style: normal; }
    .ca__wide { grid-column: 1 / -1; }
    .ca__switch { flex-direction: row !important; align-items: center; gap: 0.6rem !important; grid-column: 1 / -1; }
    .ca__note { width: 100%; }
    :host ::ng-deep .ca__filter { min-width: 16rem; }
    :host ::ng-deep .ca__status { width: 100%; }
    @media (max-width: 640px) { .ca__form { grid-template-columns: 1fr; } }
  `]
})
export class CareersAdminComponent implements OnInit {
  private readonly careers = inject(CareerService);
  private readonly students = inject(StudentService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly careersUrl = CAREERS_URL;
  readonly instagram = AVIJAN_INSTAGRAM;
  readonly facebook = AVIJAN_FACEBOOK;
  readonly statuses = STATUSES;
  readonly shift = (v: Vacancy) => shiftLabel(v);

  readonly vacancies = signal<Vacancy[]>([]);
  readonly loadingVacancies = signal(true);
  readonly applications = signal<JobApplication[]>([]);
  readonly loadingApps = signal(true);
  readonly branches = signal<BranchLookup[]>([]);
  readonly filterVacancy = signal<number | null>(null);
  readonly photos = signal<Record<number, string>>({});
  readonly photoFor = signal<JobApplication | null>(null);
  readonly noteFor = signal<JobApplication | null>(null);
  noteText = '';

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly form = signal<VacancyForm>(this.blank());

  readonly vacancyFilterOptions = computed(() => [
    { label: 'All vacancies', value: null },
    ...this.vacancies().map(v => ({ label: `${v.title} — ${v.branch}${v.shiftName ? ' (' + v.shiftName + ')' : ''}`, value: v.id }))
  ]);

  ngOnInit(): void {
    this.students.branches().subscribe({ next: b => this.branches.set(b) });
    this.loadVacancies();
    this.loadApplications();
  }

  private loadVacancies(): void {
    this.loadingVacancies.set(true);
    this.careers.vacancies().subscribe({
      next: v => { this.vacancies.set(v); this.loadingVacancies.set(false); },
      error: () => this.loadingVacancies.set(false)
    });
  }

  private loadApplications(): void {
    this.loadingApps.set(true);
    this.careers.applications(this.filterVacancy()).subscribe({
      next: a => { this.applications.set(a); this.loadingApps.set(false); },
      error: () => this.loadingApps.set(false)
    });
  }

  filterTo(id: number | null): void {
    this.filterVacancy.set(id);
    this.loadApplications();
  }

  private blank(): VacancyForm {
    return {
      id: null, title: 'Receptionist', branch: null, shiftName: '', shiftStart: null, shiftEnd: null,
      workingDays: 'Monday to Saturday', qualification: '', experience: '', salary: '', description: '',
      openings: 1, closesOn: null, isActive: true
    };
  }

  openNew(): void {
    this.form.set(this.blank());
    this.dialogOpen.set(true);
  }

  openEdit(v: Vacancy): void {
    this.form.set({
      id: v.id, title: v.title, branch: v.branch, shiftName: v.shiftName ?? '',
      shiftStart: toTime(v.shiftStart), shiftEnd: toTime(v.shiftEnd), workingDays: v.workingDays ?? '',
      qualification: v.qualification, experience: v.experience ?? '', salary: v.salary ?? '',
      description: v.description ?? '', openings: v.openings,
      closesOn: v.closesOn ? new Date(v.closesOn + 'T00:00:00') : null, isActive: v.isActive
    });
    this.dialogOpen.set(true);
  }

  save(): void {
    const f = this.form();
    if (!f.branch) { this.toast('warn', 'Choose the branch.'); return; }
    if (!f.qualification.trim()) { this.toast('warn', 'Enter the academic qualification required.'); return; }

    const request: VacancySave = {
      title: f.title.trim() || 'Receptionist', branch: f.branch, shiftName: f.shiftName.trim() || null,
      shiftStart: fromTime(f.shiftStart), shiftEnd: fromTime(f.shiftEnd), workingDays: f.workingDays.trim() || null,
      qualification: f.qualification.trim(), experience: f.experience.trim() || null, salary: f.salary.trim() || null,
      description: f.description.trim() || null, openings: f.openings || 1,
      closesOn: f.closesOn ? isoDate(f.closesOn) : null, isActive: f.isActive
    };

    this.saving.set(true);
    this.careers.save(f.id, request).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.toast('success', 'Vacancy saved', request.isActive ? 'It is now on avijan.in/careers.' : undefined);
        this.loadVacancies();
      },
      error: (err: unknown) => { this.saving.set(false); this.toast('error', errorText(err)); }
    });
  }

  remove(v: Vacancy): void {
    this.confirm.confirm({
      header: 'Delete this vacancy?',
      message: v.applications
        ? `${v.applications} people have applied. A vacancy with applications cannot be deleted — edit it and switch "Show on the website" off to close it.`
        : `Delete ${v.title} — ${v.branch}?`,
      acceptLabel: v.applications ? 'OK' : 'Delete',
      rejectVisible: !v.applications,
      accept: () => {
        if (v.applications) return;
        this.careers.delete(v.id).subscribe({
          next: () => { this.toast('success', 'Vacancy deleted'); this.loadVacancies(); },
          error: (err: unknown) => this.toast('error', errorText(err))
        });
      }
    });
  }

  async copyLink(v: Vacancy): Promise<void> {
    const link = `${CAREERS_URL}?v=${v.id}`;
    try {
      await navigator.clipboard.writeText(link);
      this.toast('success', 'Link copied', 'Paste it in your Facebook or Instagram post.');
    } catch {
      this.toast('info', link);
    }
  }

  setStatus(a: JobApplication, status: JobApplicationStatus): void {
    this.careers.setStatus(a.id, status, a.adminNote ?? null).subscribe({
      next: r => { this.patch(r.data); this.loadVacancies(); },
      error: (err: unknown) => this.toast('error', errorText(err))
    });
  }

  editNote(a: JobApplication): void {
    this.noteText = a.adminNote ?? '';
    this.noteFor.set(a);
  }

  saveNote(): void {
    const a = this.noteFor();
    if (!a) return;
    this.careers.setStatus(a.id, a.status, this.noteText.trim() || null).subscribe({
      next: r => { this.patch(r.data); this.noteFor.set(null); },
      error: (err: unknown) => this.toast('error', errorText(err))
    });
  }

  private patch(updated: JobApplication): void {
    this.applications.update(list => list.map(x => (x.id === updated.id ? updated : x)));
  }

  loadPhoto(a: JobApplication, open = false): void {
    this.careers.file(a.id, 'photo').subscribe({
      next: blob => {
        this.photos.update(p => ({ ...p, [a.id]: URL.createObjectURL(blob) }));
        if (open) this.photoFor.set(a);
      },
      error: () => this.toast('error', 'The photograph could not be loaded.')
    });
  }

  openPhoto(a: JobApplication): void {
    this.photoFor.set(a);
  }

  downloadCv(a: JobApplication): void {
    this.careers.file(a.id, 'cv').subscribe({
      next: blob => this.saveBlob(blob, a.cvFileName || `CV-${a.name}.pdf`),
      error: () => this.toast('error', 'The CV could not be downloaded.')
    });
  }

  protected saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  private toast(severity: 'success' | 'info' | 'warn' | 'error', summary: string, detail?: string): void {
    this.messages.add({ severity, summary, detail, life: 4000 });
  }
}

function toTime(t?: string | null): Date | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function fromTime(d: Date | null): string | null {
  return d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00` : null;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function errorText(err: unknown): string {
  if (err instanceof HttpErrorResponse) return err.error?.message || (err.error?.errors ?? []).join(' ') || 'Something went wrong.';
  return 'Something went wrong.';
}
