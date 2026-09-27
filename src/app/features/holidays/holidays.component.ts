import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { AuthService } from '../../core/services/auth.service';

type HolidayCategory = 'National' | 'State' | 'Festival' | 'Institute';
type HolidayFilter = 'all' | 'closed' | 'open';

interface Holiday {
  id: number;
  holidayDate: string;
  name: string;
  category: HolidayCategory;
  isInstituteHoliday: boolean;
  note?: string | null;
  modifiedBy?: string | null;
  modifiedOn?: string | null;
}

interface HolidayYear {
  year: number;
  /** Where the list came from — null only when the calendar could not be reached for a new year. */
  source: string | null;
  loadedOn: string | null;
  holidays: Holiday[];
}

interface HolidayForm {
  id: number | null;
  date: Date | null;
  name: string;
  category: HolidayCategory;
  isInstituteHoliday: boolean;
  note: string;
}

/**
 * The holiday list — every role can see it, and picks the year to show. A
 * year opened for the first time is fetched automatically from the Indian
 * holiday calendar (2026 is the West Bengal government notification). The
 * institute does not close on every one of those days, so each is marked
 * "Institute closed" or "Institute open". Admin keeps every year up to date:
 * switch a day open/closed, correct a date, add the institute's own days,
 * fetch anything missing from the calendar, or copy another year.
 */
@Component({
  selector: 'app-holidays',
  imports: [
    CommonModule, FormsModule, ButtonModule, DatePickerModule, DialogModule, InputTextModule, SelectModule,
    SelectButtonModule, TableModule, TagModule, ToggleSwitchModule
  ],
  template: `
    <div class="app-page-head hol__head">
      <div>
        <span class="app-eyebrow">Calendar</span>
        <h1>Holiday list</h1>
        <p class="app-muted">
          West Bengal government holidays and the institute's own. The institute is closed only on days
          marked <strong>Institute closed</strong>.
        </p>
      </div>

      <label class="hol__year">
        <span class="app-muted">Year</span>
        <p-select
          [options]="yearOptions"
          [ngModel]="year()"
          (ngModelChange)="selectYear($event)"
          styleClass="hol__year-select"
          appendTo="body" />
      </label>
    </div>

    @if (source(); as src) {
      <p class="app-muted hol__source">
        <i class="pi pi-info-circle" aria-hidden="true"></i>
        {{ year() }} list: {{ sourceLabel(src) }}.
        @if (isAdmin()) { Change any day below to match what the institute follows. }
      </p>
    }

    <section class="hol__summary">
      <article class="app-card hol__stat">
        <span class="app-muted">Institute closed in {{ year() }}</span>
        <strong>{{ closedCount() }} {{ closedCount() === 1 ? 'day' : 'days' }}</strong>
      </article>
      @if (nextHoliday(); as next) {
        <article class="app-card hol__stat hol__stat--next">
          <span class="app-muted">Next institute holiday</span>
          <strong>{{ next.name }}</strong>
          <small>{{ next.holidayDate | date: 'EEEE, d MMMM y' }} · {{ daysAway(next.holidayDate) }}</small>
        </article>
      }
    </section>

    <section class="app-card">
      <div class="hol__toolbar">
        <p-selectbutton
          [options]="filterOptions"
          [ngModel]="filter()"
          (ngModelChange)="filter.set($event)"
          optionLabel="label"
          optionValue="value"
          [allowEmpty]="false" />

        @if (isAdmin()) {
          <span class="hol__actions">
            <p-button label="Fetch from calendar" icon="pi pi-cloud-download" severity="secondary" [outlined]="true"
                      [loading]="syncing()" (onClick)="syncFromCalendar()" />
            <p-button label="Copy from {{ year() - 1 }}" icon="pi pi-copy" severity="secondary" [outlined]="true"
                      [loading]="copying()" (onClick)="copyPreviousYear()" />
            <p-button label="Add holiday" icon="pi pi-plus" (onClick)="openAdd()" />
          </span>
        }
      </div>

      @if (loading()) {
        <p class="app-muted hol__empty">Loading…</p>
      } @else if (holidays().length === 0) {
        <div class="hol__empty">
          <i class="pi pi-calendar-times" aria-hidden="true"></i>
          <p>No holidays are available for {{ year() }} yet.</p>
          @if (isAdmin()) {
            <p class="app-muted">
              The holiday calendar could not be reached or has nothing for {{ year() }}. Try
              <strong>Fetch from calendar</strong> again, or <strong>Copy from {{ year() - 1 }}</strong> and
              correct the festival dates.
            </p>
          } @else {
            <p class="app-muted">Please check again later.</p>
          }
        </div>
      } @else {
        <p-table [value]="visible()" styleClass="p-datatable-sm hol__table" [rowTrackBy]="trackById">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 9rem">Date</th>
              <th>Holiday</th>
              <th class="hol__col-type" style="width: 7rem">Type</th>
              <th class="hol__col-inst" [class.hol__col-inst--admin]="isAdmin()" style="width: 10rem">Institute</th>
              @if (isAdmin()) { <th style="width: 6rem"></th> }
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-h>
            <tr [class.hol__row--past]="isPast(h.holidayDate)" [class.hol__row--open]="!h.isInstituteHoliday">
              <td>
                <strong>{{ h.holidayDate | date: 'd MMM' }}</strong>
                <small class="app-muted hol__weekday">{{ h.holidayDate | date: 'EEEE' }}</small>
              </td>
              <td>
                {{ h.name }}
                @if (h.note) { <small class="app-muted hol__note">{{ h.note }}</small> }
                @if (!isAdmin()) {
                  <!-- Phones only: the Institute column is hidden there, so the status sits under the name. -->
                  <span class="hol__mobile-status">
                    <p-tag [value]="h.isInstituteHoliday ? 'Institute closed' : 'Institute open'"
                           [severity]="h.isInstituteHoliday ? 'danger' : 'secondary'" />
                  </span>
                }
              </td>
              <td class="hol__col-type"><p-tag [value]="categoryLabel(h.category)" [severity]="categorySeverity(h.category)" /></td>
              <td class="hol__col-inst" [class.hol__col-inst--admin]="isAdmin()">
                @if (isAdmin()) {
                  <span class="hol__switch">
                    <p-toggleswitch [ngModel]="h.isInstituteHoliday" (ngModelChange)="setClosed(h, $event)"
                                    [disabled]="savingId() === h.id" />
                    <span [class.hol__closed]="h.isInstituteHoliday">{{ h.isInstituteHoliday ? 'Closed' : 'Open' }}</span>
                  </span>
                } @else {
                  <p-tag [value]="h.isInstituteHoliday ? 'Institute closed' : 'Institute open'"
                         [severity]="h.isInstituteHoliday ? 'danger' : 'secondary'" />
                }
              </td>
              @if (isAdmin()) {
                <td class="hol__row-actions">
                  <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" (onClick)="openEdit(h)" ariaLabel="Edit" />
                  <p-button icon="pi pi-trash" severity="danger" [text]="true" [rounded]="true" (onClick)="remove(h)"
                            ariaLabel="Delete" />
                </td>
              }
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td [attr.colspan]="isAdmin() ? 5 : 4" class="app-muted">Nothing matches this filter.</td></tr>
          </ng-template>
        </p-table>
      }
    </section>

    <p-dialog
      [header]="form().id ? 'Edit holiday' : 'Add holiday'"
      [visible]="dialogOpen()"
      (visibleChange)="dialogOpen.set($event)"
      [modal]="true"
      [style]="{ width: 'min(28rem, 95vw)' }"
      appendTo="body">
      <div class="hol__form">
        <label>Date
          <p-datepicker [(ngModel)]="form().date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" />
        </label>
        <label>Holiday name
          <input pInputText [(ngModel)]="form().name" maxlength="150" placeholder="e.g. Institute foundation day" />
        </label>
        <label>Type
          <p-select [options]="categoryOptions" optionLabel="label" optionValue="value" [(ngModel)]="form().category"
                    appendTo="body" />
        </label>
        <label class="hol__form-switch">
          <p-toggleswitch [(ngModel)]="form().isInstituteHoliday" />
          Institute closed on this day
        </label>
        <label>Note (optional)
          <input pInputText [(ngModel)]="form().note" maxlength="300" />
        </label>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogOpen.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()"
                  [disabled]="!form().date || !form().name.trim()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .hol__head { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }
    .hol__year { display: grid; gap: 0.25rem; font-size: 0.8rem; }
    :host ::ng-deep .hol__year-select { min-width: 8rem; font-weight: 700; }
    .hol__source { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; margin: -0.3rem 0 1rem; }
    .hol__summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .hol__stat { display: flex; flex-direction: column; gap: 0.2rem; }
    .hol__stat strong { font-size: 1.35rem; }
    .hol__stat--next strong { font-size: 1.1rem; color: var(--app-brand); }
    .hol__toolbar { display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.8rem; }
    .hol__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .hol__empty { text-align: center; padding: 2rem 1rem; }
    .hol__empty i { font-size: 2rem; color: var(--app-text-muted); }
    .hol__weekday, .hol__note { display: block; font-size: 0.75rem; }
    .hol__row--past td { opacity: 0.55; }
    .hol__row--open td:nth-child(2) { color: var(--app-text-muted); }
    .hol__switch { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
    .hol__closed { color: var(--app-negative); font-weight: 600; }
    .hol__row-actions { white-space: nowrap; text-align: right; }
    .hol__form { display: grid; gap: 0.9rem; }
    .hol__form label { display: grid; gap: 0.3rem; font-size: 0.85rem; }
    .hol__form-switch { display: flex !important; align-items: center; gap: 0.6rem; }
    :host ::ng-deep .hol__form .p-datepicker, :host ::ng-deep .hol__form .p-select { width: 100%; }
    .hol__mobile-status { display: none; margin-top: 0.3rem; }

    /* Phones: drop the Type column; everyone but Admin sees closed/open under the name instead of a column. */
    @media (max-width: 640px) {
      .hol__col-type { display: none; }
      .hol__col-inst:not(.hol__col-inst--admin) { display: none; }
      .hol__mobile-status { display: block; }
      .hol__switch span { display: none; }
      .hol__toolbar p-selectbutton { width: 100%; overflow-x: auto; }
    }
  `
})
export class HolidaysComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly base = `${environment.apiBaseUrl}/holidays`;

  readonly isAdmin = computed(() => this.auth.hasAnyRole(['Admin', 'SuperAdmin']));

  readonly year = signal(new Date().getFullYear());
  readonly holidays = signal<Holiday[]>([]);
  readonly source = signal<string | null>(null);
  readonly syncing = signal(false);

  /** Last year through five years ahead — as far as the holiday calendar publishes. */
  readonly yearOptions = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 1 + i);
  readonly loading = signal(false);
  readonly filter = signal<HolidayFilter>('all');

  readonly dialogOpen = signal(false);
  readonly form = signal<HolidayForm>(this.blankForm());
  readonly saving = signal(false);
  readonly savingId = signal<number | null>(null);
  readonly copying = signal(false);

  readonly filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Institute closed', value: 'closed' },
    { label: 'Institute open', value: 'open' }
  ];

  readonly categoryOptions = [
    { label: 'National', value: 'National' },
    { label: 'West Bengal govt', value: 'State' },
    { label: 'Festival', value: 'Festival' },
    { label: 'Institute', value: 'Institute' }
  ];

  readonly visible = computed(() => {
    const f = this.filter();
    return this.holidays().filter(h => f === 'all' || (f === 'closed') === h.isInstituteHoliday);
  });

  readonly closedCount = computed(() => this.holidays().filter(h => h.isInstituteHoliday).length);

  /** The next day the institute is actually closed, today included. */
  readonly nextHoliday = computed(() => {
    const today = this.todayIso();
    return this.holidays().find(h => h.isInstituteHoliday && h.holidayDate >= today) ?? null;
  });

  readonly trackById = (_: number, h: Holiday) => h.id;

  ngOnInit(): void {
    this.load();
  }

  selectYear(year: number): void {
    if (year === this.year()) return;
    this.year.set(year);
    this.load();
  }

  private load(): void {
    const year = this.year();
    this.loading.set(true);
    this.http.get<ApiResponse<HolidayYear>>(this.base, { params: { year } })
      .pipe(map(r => r.data))
      .subscribe({
        next: data => {
          // A slow first-time fetch for one year must not land on top of another the user has since picked.
          if (data.year !== this.year()) return;
          this.holidays.set(data.holidays);
          this.source.set(data.source);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  sourceLabel(src: string): string {
    if (src === 'WB govt notification') return 'West Bengal government holiday notification';
    if (src === 'Indian holiday calendar') return 'loaded automatically from the Indian holiday calendar';
    if (src === 'Admin') return 'set by Admin';
    return src.toLowerCase().startsWith('copied') ? src.replace(/^Copied/, 'copied') : src;
  }

  /* ------------------------------------------------------------ admin */

  openAdd(): void {
    const y = this.year();
    const now = new Date();
    this.form.set({ ...this.blankForm(), date: y === now.getFullYear() ? now : new Date(y, 0, 1) });
    this.dialogOpen.set(true);
  }

  openEdit(h: Holiday): void {
    this.form.set({
      id: h.id,
      date: this.parseDate(h.holidayDate),
      name: h.name,
      category: h.category,
      isInstituteHoliday: h.isInstituteHoliday,
      note: h.note ?? ''
    });
    this.dialogOpen.set(true);
  }

  save(): void {
    const f = this.form();
    if (!f.date || !f.name.trim()) return;

    const body = {
      holidayDate: this.toIso(f.date),
      name: f.name.trim(),
      category: f.category,
      isInstituteHoliday: f.isInstituteHoliday,
      note: f.note.trim() || null
    };

    this.saving.set(true);
    const request = f.id
      ? this.http.put<ApiResponse<Holiday>>(`${this.base}/${f.id}`, body)
      : this.http.post<ApiResponse<Holiday>>(this.base, body);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.messages.add({ severity: 'success', summary: f.id ? 'Holiday saved' : 'Holiday added', life: 3000 });
        // A date moved into another year leaves this one; reloading keeps the list honest either way.
        this.load();
      },
      error: () => this.saving.set(false)
    });
  }

  /** The inline switch: flips closed/open straight away, and puts it back if the save fails. */
  setClosed(h: Holiday, closed: boolean): void {
    this.savingId.set(h.id);
    this.patchLocal(h.id, { isInstituteHoliday: closed });

    this.http.put<ApiResponse<Holiday>>(`${this.base}/${h.id}`, {
      holidayDate: h.holidayDate, name: h.name, category: h.category, isInstituteHoliday: closed, note: h.note ?? null
    }).subscribe({
      next: r => { this.savingId.set(null); this.patchLocal(h.id, r.data); },
      error: () => { this.savingId.set(null); this.patchLocal(h.id, { isInstituteHoliday: !closed }); }
    });
  }

  remove(h: Holiday): void {
    if (!confirm(`Remove "${h.name}" on ${new Date(h.holidayDate + 'T00:00').toDateString()} from the list?`)) return;

    this.http.delete<ApiResponse<boolean>>(`${this.base}/${h.id}`).subscribe({
      next: () => {
        this.holidays.update(list => list.filter(x => x.id !== h.id));
        this.messages.add({ severity: 'success', summary: 'Holiday removed', life: 3000 });
      }
    });
  }

  copyPreviousYear(): void {
    const from = this.year() - 1, to = this.year();
    const note = this.holidays().length
      ? ` Days already on the ${to} list are kept.`
      : '';
    if (!confirm(`Copy all ${from} holidays into ${to} on the same dates?${note}\n\nFestival dates change every year — check and correct them afterwards.`)) return;

    this.copying.set(true);
    this.http.post<ApiResponse<number>>(`${this.base}/copy`, null, { params: { fromYear: from, toYear: to } })
      .subscribe({
        next: r => {
          this.copying.set(false);
          this.messages.add({
            severity: 'success',
            summary: `${r.data} holidays copied from ${from}`,
            detail: 'Check the festival dates — they move every year.',
            life: 6000
          });
          this.load();
        },
        error: () => this.copying.set(false)
      });
  }

  /** Adds whatever the holiday calendar has for this year that is not on the list — never changes existing days. */
  syncFromCalendar(): void {
    const year = this.year();
    this.syncing.set(true);
    this.http.post<ApiResponse<number>>(`${this.base}/sync`, null, { params: { year } })
      .subscribe({
        next: r => {
          this.syncing.set(false);
          this.messages.add({
            severity: r.data ? 'success' : 'info',
            summary: r.data ? `${r.data} holidays added for ${year}` : `${year} is already up to date`,
            detail: r.data ? 'Check them and mark which days the institute closes.' : 'Nothing new in the calendar.',
            life: 6000
          });
          this.load();
        },
        error: () => this.syncing.set(false)
      });
  }

  /* ------------------------------------------------------------ misc */

  categoryLabel(c: HolidayCategory): string {
    return c === 'State' ? 'WB govt' : c;
  }

  categorySeverity(c: HolidayCategory): 'info' | 'warn' | 'success' | 'contrast' {
    return c === 'National' ? 'info' : c === 'State' ? 'warn' : c === 'Festival' ? 'contrast' : 'success';
  }

  isPast(iso: string): boolean {
    return iso < this.todayIso();
  }

  daysAway(iso: string): string {
    const days = Math.round((this.parseDate(iso).getTime() - this.parseDate(this.todayIso()).getTime()) / 86_400_000);
    return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  }

  private patchLocal(id: number, patch: Partial<Holiday>): void {
    this.holidays.update(list => list.map(x => (x.id === id ? { ...x, ...patch } : x)));
  }

  private blankForm(): HolidayForm {
    return { id: null, date: null, name: '', category: 'Institute', isInstituteHoliday: true, note: '' };
  }

  /** Local date only — a Date's own toISOString() would shift to UTC and can land on the previous day in India. */
  private toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private parseDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private todayIso(): string {
    return this.toIso(new Date());
  }
}
