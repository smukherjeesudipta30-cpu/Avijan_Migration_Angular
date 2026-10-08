import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectButtonModule } from 'primeng/selectbutton';

import { CAREERS_URL } from '../../core/models/career.model';
import { SiteVisitService, SiteVisitSummary } from '../../core/services/site-visit.service';

/**
 * Website visitors — how many people opened the public pages, and where they
 * came from (Google, Facebook, Instagram, WhatsApp, …), to see how the site's
 * SEO and social-media promotion is working. Admin and Editor.
 */
@Component({
  selector: 'app-site-visits',
  standalone: true,
  imports: [DatePipe, FormsModule, SelectButtonModule],
  template: `
    <div class="app-page-head sv__head">
      <div>
        <span class="app-eyebrow">Promotion</span>
        <h1>Website visitors</h1>
        <p class="app-muted">People who opened the home page, careers or the competition page — on the website or the app.
          Counted once a person a day; no cookies or personal details are kept.</p>
      </div>
      <p-selectbutton [options]="ranges" [ngModel]="days()" (ngModelChange)="setDays($event)" optionLabel="label" optionValue="value" [allowEmpty]="false" />
    </div>

    @if (data(); as d) {
      <section class="sv__tiles">
        <article class="app-card sv__tile"><span>Today</span><strong>{{ d.visitorsToday }}</strong><small>visitors</small></article>
        <article class="app-card sv__tile"><span>Last 7 days</span><strong>{{ d.visitorsLast7Days }}</strong><small>visitors</small></article>
        <article class="app-card sv__tile"><span>Last 30 days</span><strong>{{ d.visitorsLast30Days }}</strong><small>visitors · {{ d.visitsLast30Days }} page visits</small></article>
      </section>

      <section class="app-card sv__card">
        <h2>Visitors per day</h2>
        <div class="sv__chart" role="img" [attr.aria-label]="'Visitors per day over the last ' + days() + ' days'">
          @for (day of chartDays(); track day.date) {
            <div class="sv__bar-wrap" [title]="(day.date | date: 'EEE d MMM') + ': ' + day.visitors + ' visitors'">
              <div class="sv__bar" [style.height.%]="maxDay() ? (day.visitors * 100 / maxDay()) : 0"></div>
            </div>
          }
        </div>
        <div class="sv__chart-axis"><span>{{ chartDays()[0]?.date | date: 'd MMM' }}</span><span>Today</span></div>
      </section>

      <div class="sv__two">
        <section class="app-card sv__card">
          <h2>Where visitors came from</h2>
          @for (s of d.sources; track s.name) {
            <div class="sv__row">
              <span class="sv__name"><i class="pi" [class]="'pi ' + sourceIcon(s.name)"></i> {{ s.name }}</span>
              <div class="sv__track"><div class="sv__fill" [style.width.%]="share(s.visitors, d.sources)"></div></div>
              <strong>{{ s.visitors }}</strong>
            </div>
          } @empty { <p class="app-muted">No visits yet.</p> }
        </section>

        <section class="app-card sv__card">
          <h2>Pages</h2>
          @for (p of d.pages; track p.name) {
            <div class="sv__row">
              <span class="sv__name">{{ p.name }}</span>
              <div class="sv__track"><div class="sv__fill sv__fill--alt" [style.width.%]="share(p.visitors, d.pages)"></div></div>
              <strong>{{ p.visitors }}</strong>
            </div>
          } @empty { <p class="app-muted">No visits yet.</p> }
          @if (d.platforms.length) {
            <p class="app-muted sv__platforms">
              @for (p of d.platforms; track p.name; let last = $last) { {{ p.name }}: {{ p.visitors }}@if (!last) { · } }
            </p>
          }
        </section>
      </div>

      <section class="app-card sv__card sv__tip">
        <h2>Tip: tag your posts</h2>
        <p class="app-muted">Visits are counted by where people came from automatically. Facebook and Instagram apps often hide that,
          so add a tag to the links you post, and they will be counted correctly:</p>
        <code>{{ careersUrl }}?utm_source=instagram</code>
        <code>{{ careersUrl }}?utm_source=facebook</code>
        <code>{{ careersUrl }}?utm_source=whatsapp</code>
      </section>
    } @else {
      <p class="app-muted">{{ loading() ? 'Loading…' : 'The visitor figures could not be loaded.' }}</p>
    }
  `,
  styles: [`
    .sv__head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-end; }
    .sv__tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .sv__tile { display: flex; flex-direction: column; gap: 0.15rem; }
    .sv__tile span { color: var(--app-text-muted, #66708a); font-size: 0.85rem; }
    .sv__tile strong { font-size: 2rem; line-height: 1.1; }
    .sv__tile small { color: var(--app-text-muted, #66708a); }
    .sv__card { margin-bottom: 1rem; }
    .sv__card h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .sv__chart { display: flex; align-items: flex-end; gap: 3px; height: 9rem; }
    .sv__bar-wrap { flex: 1; height: 100%; display: flex; align-items: flex-end; }
    .sv__bar { width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: var(--p-primary-color); }
    .sv__chart-axis { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--app-text-muted, #66708a); margin-top: 0.3rem; }
    .sv__two { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1rem; }
    .sv__two .sv__card { margin-bottom: 0; }
    .sv__row { display: grid; grid-template-columns: 9rem 1fr 3rem; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; font-size: 0.9rem; }
    .sv__row strong { text-align: right; }
    .sv__name { display: flex; align-items: center; gap: 0.4rem; }
    .sv__track { height: 0.6rem; border-radius: 999px; background: var(--app-page-bg, #eef1f6); overflow: hidden; }
    .sv__fill { height: 100%; border-radius: 999px; background: var(--p-primary-color); }
    .sv__fill--alt { background: #1f7a54; }
    .sv__platforms { margin: 0.6rem 0 0; font-size: 0.85rem; }
    .sv__tip { margin-top: 1rem; }
    .sv__tip code { display: block; margin-top: 0.35rem; padding: 0.35rem 0.6rem; border-radius: 6px; background: var(--app-page-bg, #f2f4f8); font-size: 0.85rem; word-break: break-all; }
  `]
})
export class SiteVisitsComponent implements OnInit {
  private readonly visits = inject(SiteVisitService);

  readonly careersUrl = CAREERS_URL;
  readonly ranges = [{ label: '30 days', value: 30 }, { label: '90 days', value: 90 }, { label: '1 year', value: 365 }];
  readonly days = signal(30);
  readonly loading = signal(true);
  readonly data = signal<SiteVisitSummary | null>(null);

  /** Oldest first, for the chart. */
  readonly chartDays = computed(() => [...(this.data()?.days ?? [])].reverse());
  readonly maxDay = computed(() => Math.max(0, ...this.chartDays().map(d => d.visitors)));

  ngOnInit(): void {
    this.load();
  }

  setDays(days: number): void {
    this.days.set(days);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.visits.summary(this.days()).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  share(value: number, all: { visitors: number }[]): number {
    const max = Math.max(1, ...all.map(a => a.visitors));
    return (value * 100) / max;
  }

  sourceIcon(name: string): string {
    return name === 'Facebook' ? 'pi-facebook'
      : name === 'Instagram' ? 'pi-instagram'
      : name === 'WhatsApp' ? 'pi-whatsapp'
      : name === 'Google' ? 'pi-google'
      : name === 'Direct' ? 'pi-link'
      : 'pi-globe';
  }
}
