import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { OfferService } from '../../core/services/offer.service';

/** Today as "yyyy-MM-dd" in local time, for the date input. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

/**
 * The admission offer on the public front page: the percentage in the corner
 * ribbon, and the days it shows. Admin and Receptionist.
 */
@Component({
  selector: 'app-offer-settings',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Public site</span>
      <h1>Admission offer</h1>
      <p class="app-muted">The discount shown in the red corner ribbon on the front page, and for how many days it shows.
        Outside those days, or at 0%, the ribbon is hidden.</p>
    </div>

    <div class="of__grid">
      <section class="app-card of__form">
        <label>Offer percentage
          <span class="of__suffix"><input pInputText type="number" min="0" max="100" step="1"
            [ngModel]="percentage()" (ngModelChange)="percentage.set($event)" /><span>% OFF</span></span></label>

        <label>Show from
          <input pInputText type="date" [ngModel]="startsOn()" (ngModelChange)="startsOn.set($event)" /></label>

        <label>For how many days
          <span class="of__suffix"><input pInputText type="number" min="1" max="366" step="1"
            [ngModel]="days()" (ngModelChange)="days.set($event)" /><span>days</span></span></label>

        @if (endsOn(); as end) {
          <p class="of__note"><i class="pi pi-calendar"></i> Shows until <strong>{{ end | date: 'd MMM y' }}</strong> (last day).</p>
        }

        <div class="of__actions">
          <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
          <p-button label="Stop the offer" icon="pi pi-ban" severity="secondary" [outlined]="true"
            [disabled]="saving()" (onClick)="stop()" />
        </div>
        @if (modifiedOn()) {
          <small class="app-muted">Last changed {{ modifiedOn() | date: 'd MMM y, h:mm a' }}@if (modifiedBy()) { by {{ modifiedBy() }} }</small>
        }
      </section>

      <section class="app-card of__preview">
        <h2>On the front page now</h2>
        <div class="of__sample">
          @if (showingNow()) {
            <div class="of__ribbon">{{ savedPercentage() }}% OFF</div>
            <p>The ribbon is showing.</p>
          } @else {
            <p class="app-muted">No ribbon is showing today.</p>
          }
        </div>
      </section>
    </div>
  `,
  styles: [`
    .of__grid { display: grid; grid-template-columns: minmax(18rem, 26rem) 1fr; gap: 1rem; align-items: start; }
    .of__form { display: flex; flex-direction: column; gap: 0.9rem; }
    .of__form > label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 600; }
    .of__suffix { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
    .of__suffix input { width: 7rem; }
    .of__note { margin: 0; font-size: 0.85rem; display: flex; gap: 0.4rem; align-items: center; }
    .of__actions { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
    .of__preview h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
    .of__sample { position: relative; overflow: hidden; min-height: 8rem; border: 1px solid var(--app-border); border-radius: 8px; padding: 1rem; }
    .of__sample p { margin: 2.5rem 0 0; }
    .of__ribbon { position: absolute; top: 20px; right: -60px; background: #d62828; color: #fff; padding: 5px 60px;
      transform: rotate(45deg); font-weight: 700; font-size: 14px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3); }
    @media (max-width: 900px) { .of__grid { grid-template-columns: 1fr; } }
  `]
})
export class OfferSettingsComponent implements OnInit {
  private readonly offers = inject(OfferService);
  private readonly messages = inject(MessageService);

  readonly percentage = signal<number | null>(30);
  readonly startsOn = signal<string>(todayIso());
  readonly days = signal<number | null>(30);
  readonly saving = signal(false);
  readonly modifiedOn = signal<string | null>(null);
  readonly modifiedBy = signal<string | null>(null);
  /** As last saved — the preview shows what the public page shows, not unsaved edits. */
  readonly savedPercentage = signal(0);
  readonly showingNow = signal(false);

  /** The last day it shows, from the form as it stands. */
  readonly endsOn = computed(() => {
    const start = this.startsOn();
    const days = Number(this.days());
    if (!start || !Number.isInteger(days) || days < 1) return null;
    const [y, m, d] = start.split('-').map(Number);
    return new Date(y, m - 1, d + days - 1);
  });

  ngOnInit(): void {
    this.offers.settings().subscribe(s => {
      if (!s) return;
      this.percentage.set(s.percentage);
      this.startsOn.set(s.startsOn);
      this.days.set(s.days);
      this.applySaved(s.percentage, s.isShowing, s.modifiedOn, s.modifiedBy);
    });
  }

  save(): void {
    const percentage = Number(this.percentage());
    const days = Number(this.days());
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
      this.warn('Enter a whole percentage from 0 to 100.');
      return;
    }
    if (!this.startsOn()) {
      this.warn('Choose the day the offer starts.');
      return;
    }
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      this.warn('Enter between 1 and 366 days.');
      return;
    }
    this.send(percentage, this.startsOn(), days, 'Offer saved.');
  }

  /** Sets 0%, which hides the ribbon straight away and keeps the dates for next time. */
  stop(): void {
    this.percentage.set(0);
    this.send(0, this.startsOn() || todayIso(), Number(this.days()) || 1, 'Offer stopped — the ribbon is hidden.');
  }

  private send(percentage: number, startsOn: string, days: number, done: string): void {
    this.saving.set(true);
    this.offers.save({ percentage, startsOn, days }).subscribe({
      next: s => {
        this.saving.set(false);
        this.applySaved(s.percentage, s.isShowing, s.modifiedOn, s.modifiedBy);
        this.messages.add({ severity: 'success', summary: done, life: 3000 });
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.warn(e.error?.message ?? 'The offer could not be saved.');
      }
    });
  }

  private applySaved(percentage: number, showing: boolean, on: string | null, by: string | null): void {
    this.savedPercentage.set(percentage);
    this.showingNow.set(showing);
    this.modifiedOn.set(on);
    this.modifiedBy.set(by);
  }

  private warn(detail: string): void {
    this.messages.add({ severity: 'warn', summary: 'Check the offer', detail, life: 4000 });
  }
}
