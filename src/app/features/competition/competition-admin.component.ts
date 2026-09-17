import { CommonModule } from '@angular/common';
import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  CompetitionOrganiser,
  CompetitionPublic,
  CompetitionSaveRequest
} from '../../core/models/competition.model';
import { CompetitionService } from '../../core/services/competition.service';
import { BengaliEditorComponent } from '../../shared/bengali-editor/bengali-editor.component';

/**
 * Where the administrator sets up the year's competition.
 *
 * <p>Every figure the public portal shows comes from here — the fees, the times, the
 * venue, the rules in both languages, and the dates registration is open between.
 * The owner asked for exactly that: "Time, Amount, Rules can be changed which will
 * be entered by admin only."</p>
 *
 * <p>Registration is closed until the opening date is set, so creating next year's
 * row does not put an advertisement on the front page by itself.</p>
 */
@Component({
  selector: 'app-competition-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, BengaliEditorComponent],
  templateUrl: './competition-admin.component.html',
  styleUrl: './competition-admin.component.scss'
})
export class CompetitionAdminComponent implements OnInit {
  private readonly competitions = inject(CompetitionService);

  readonly years = signal<CompetitionPublic[]>([]);
  readonly chosen = signal<CompetitionPublic | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  form: CompetitionSaveRequest = CompetitionAdminComponent.blank();

  /* ------------------------------------------------------------ posters */

  /** The two slots, in the order the portal shows them. */
  readonly advertSlots = [
    { key: 'Drawing' as const, label: 'Drawing advertisement' },
    { key: 'Dance' as const, label: 'Dance advertisement' }
  ];

  /* Bumped after an upload so the browser re-fetches a poster it has cached for
     the day -- without it, replacing the artwork appears to do nothing. */
  readonly cacheBuster = signal(Date.now());

  advertUrl(competitionId: number, slot: 'Drawing' | 'Dance'): string {
    return this.competitions.advertUrl(competitionId, slot);
  }

  uploadAdvert(competitionId: number, slot: 'Drawing' | 'Dance', event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.clearNotes();

    this.competitions.uploadAdvert(competitionId, slot, file).subscribe({
      next: response => {
        input.value = '';

        if (response.success === false) {
          this.error.set(response.message ?? 'That advertisement could not be uploaded.');
          return;
        }

        this.message.set('Advertisement uploaded.');
        this.cacheBuster.set(Date.now());
        this.load();
      },
      error: err => {
        input.value = '';
        this.error.set(err?.error?.message ?? 'That advertisement could not be uploaded.');
      }
    });
  }

  removeAdvert(competitionId: number, slot: 'Drawing' | 'Dance'): void {
    if (!confirm('Remove this advertisement from the registration page?')) return;

    this.competitions.removeAdvert(competitionId, slot).subscribe({
      next: () => {
        this.message.set('Advertisement removed.');
        this.cacheBuster.set(Date.now());
        this.load();
      },
      error: () => this.error.set('That advertisement could not be removed.')
    });
  }

  /* ---------------------------------------------------------- organisers */

  readonly organisers = signal<CompetitionOrganiser[]>([]);
  organiserForm = { id: null as number | null, name: '', designation: '', phone: '' };

  private static blank(): CompetitionSaveRequest {
    return {
      year: new Date().getFullYear() + 1,
      eventDate: null,
      venue: null,
      venueBengali: null,
      drawingFee: 40,
      danceFee: 100,
      drawingStartTime: null,
      danceStartTime: null,
      prizeGivingTime: null,
      noticeEnglish: null,
      noticeBengali: null,
      drawingRulesEnglish: null,
      drawingRulesBengali: null,
      danceRulesEnglish: null,
      danceRulesBengali: null,
      registrationOpensOn: null,
      registrationClosesOn: null,
      contactPhones: null,
      isActive: true
    };
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.competitions.all().subscribe({
      next: years => {
        this.years.set(years);
        this.loading.set(false);

        const keep = this.chosen()?.competitionId;
        const next = years.find(y => y.competitionId === keep) ?? years[0] ?? null;

        if (next) this.choose(next);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('The competition settings could not be loaded.');
      }
    });
  }

  choose(competition: CompetitionPublic): void {
    this.chosen.set(competition);
    this.organisers.set(competition.organisers);
    this.clearNotes();

    this.form = {
      year: competition.year,
      eventDate: competition.eventDate ?? null,
      venue: competition.venue ?? null,
      venueBengali: competition.venueBengali ?? null,
      drawingFee: competition.drawingFee,
      danceFee: competition.danceFee,
      drawingStartTime: this.hhmm(competition.drawingStartTime),
      danceStartTime: this.hhmm(competition.danceStartTime),
      prizeGivingTime: this.hhmm(competition.prizeGivingTime),
      noticeEnglish: competition.noticeEnglish ?? null,
      noticeBengali: competition.noticeBengali ?? null,
      drawingRulesEnglish: competition.drawingRulesEnglish ?? null,
      drawingRulesBengali: competition.drawingRulesBengali ?? null,
      danceRulesEnglish: competition.danceRulesEnglish ?? null,
      danceRulesBengali: competition.danceRulesBengali ?? null,
      registrationOpensOn: competition.registrationOpensOn ?? null,
      registrationClosesOn: competition.registrationClosesOn ?? null,
      contactPhones: competition.contactPhones ?? null,
      isActive: true
    };
  }

  startNewYear(): void {
    this.chosen.set(null);
    this.organisers.set([]);
    this.form = CompetitionAdminComponent.blank();
    this.clearNotes();
  }

  save(): void {
    this.saving.set(true);
    this.clearNotes();

    const existing = this.chosen();

    /* A <input type="time"> yields "09:00", and System.Text.Json will not read that
       into a TimeOnly — it wants seconds, and answers "The JSON value could not be
       converted to System.Nullable`1[System.TimeOnly]". An emptied field yields "",
       which fails the same way, so it becomes null rather than a blank string. */
    const request: CompetitionSaveRequest = {
      ...this.form,
      drawingStartTime: this.toTime(this.form.drawingStartTime),
      danceStartTime: this.toTime(this.form.danceStartTime),
      prizeGivingTime: this.toTime(this.form.prizeGivingTime),
      eventDate: this.blank(this.form.eventDate),
      registrationOpensOn: this.blank(this.form.registrationOpensOn),
      registrationClosesOn: this.blank(this.form.registrationClosesOn),
      venue: this.blank(this.form.venue),
      venueBengali: this.blank(this.form.venueBengali),
      contactPhones: this.blank(this.form.contactPhones),
      noticeEnglish: this.blank(this.form.noticeEnglish),
      noticeBengali: this.blank(this.form.noticeBengali),
      drawingRulesEnglish: this.blank(this.form.drawingRulesEnglish),
      drawingRulesBengali: this.blank(this.form.drawingRulesBengali),
      danceRulesEnglish: this.blank(this.form.danceRulesEnglish),
      danceRulesBengali: this.blank(this.form.danceRulesBengali)
    };

    const request$ = existing
      ? this.competitions.update(existing.competitionId, request)
      : this.competitions.create(request);

    request$.subscribe({
      next: response => {
        this.saving.set(false);

        if (response.success === false) {
          this.error.set(response.message ?? 'That could not be saved.');
          return;
        }

        this.message.set('Saved.');
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.errors?.join(' ') ?? err?.error?.message ?? 'That could not be saved.');
      }
    });
  }

  /* ---------------------------------------------------------- organisers */

  editOrganiser(organiser: CompetitionOrganiser): void {
    this.organiserForm = {
      id: organiser.id,
      name: organiser.name,
      designation: organiser.designation ?? '',
      phone: organiser.phone ?? ''
    };
  }

  saveOrganiser(): void {
    const competition = this.chosen();
    if (!competition) return;

    if (!this.organiserForm.name.trim()) {
      this.error.set('Enter the name to show on the form.');
      return;
    }

    const request = {
      name: this.organiserForm.name.trim(),
      designation: this.organiserForm.designation.trim() || null,
      phone: this.organiserForm.phone.trim() || null,
      sortOrder: this.organisers().length + 1,
      isActive: true
    };

    const id = this.organiserForm.id;

    const request$ = id
      ? this.competitions.updateOrganiser(competition.competitionId, id, request)
      : this.competitions.addOrganiser(competition.competitionId, request);

    request$.subscribe({
      next: () => {
        this.organiserForm = { id: null, name: '', designation: '', phone: '' };
        this.message.set('Name saved.');
        this.load();
      },
      error: () => this.error.set('That name could not be saved.')
    });
  }

  removeOrganiser(organiser: CompetitionOrganiser): void {
    if (!confirm(`Remove ${organiser.name} from the registration form?`)) return;

    this.competitions.deleteOrganiser(organiser.id).subscribe({
      next: () => {
        this.message.set('Name removed.');
        this.load();
      },
      error: () => this.error.set('That name could not be removed.')
    });
  }

  /* -------------------------------------------------------------- helpers */

  /** A time input wants HH:mm; the API answers HH:mm:ss. */
  private hhmm(value: string | undefined): string | null {
    return value ? value.slice(0, 5) : null;
  }

  /** "09:00" back to "09:00:00", which is what TimeOnly will read. */
  private toTime(value: string | null): string | null {
    const text = (value ?? '').trim();
    if (!text) return null;

    return /^\d{2}:\d{2}$/.test(text) ? `${text}:00` : text;
  }

  /** An emptied field is null, not an empty string — "" converts to nothing. */
  private blank(value: string | null): string | null {
    const text = (value ?? '').trim();
    return text ? text : null;
  }

  private clearNotes(): void {
    this.message.set(null);
    this.error.set(null);
  }
}
