import { Component, computed, input } from '@angular/core';

import { PreSchoolHoliday } from '../../core/models/preschool.model';

/** One tile: a PreSchool holiday, which may run over several days. */
interface ClosureTile {
  id: number;
  title: string;
  note?: string | null;
  days: number;
  /** "8" or "19–21". */
  dayLabel: string;
  monthShort: string;
  /** "Sunday" or "Mon – Wed · 3 days closed". */
  weekdays: string;
  state: 'past' | 'today' | 'next' | 'later';
  away: string;
}

const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const DAY_MS = 86_400_000;

/**
 * The PreSchool's holiday notice for this month — the same card as the
 * Computer Centre's "Institute closed in …" on its front page: a tile per
 * holiday with its days, the next one marked "In 4 days", today's "Closed
 * today", and those gone "Over". Kept separate so the Computer Centre's card
 * is untouched; the holidays are the PreSchool's own.
 */
@Component({
  selector: 'app-preschool-closures',
  standalone: true,
  template: `
    <section class="pcl" aria-labelledby="pcl-title">
      <header class="pcl__head">
        <span class="pcl__icon" aria-hidden="true"><i class="pi pi-calendar-times"></i></span>
        <div>
          <p class="pcl__eyebrow">Holiday notice</p>
          <h2 id="pcl-title">PreSchool closed in {{ monthTitle }}</h2>
        </div>
        @if (tiles().length) {
          <span class="pcl__count">{{ dayCount() }} {{ dayCount() === 1 ? 'day' : 'days' }}</span>
        }
      </header>

      @if (tiles().length) {
        <ul class="pcl__list">
          @for (t of tiles(); track t.id) {
            <li class="pcl__tile" [class.is-past]="t.state === 'past'" [class.is-today]="t.state === 'today'" [class.is-next]="t.state === 'next'">
              <div class="pcl__date">
                <span class="pcl__day">{{ t.dayLabel }}</span>
                <span class="pcl__month">{{ t.monthShort }}</span>
              </div>
              <div class="pcl__info">
                <p class="pcl__name">{{ t.title }}</p>
                <p class="pcl__when">{{ t.weekdays }}</p>
                @if (t.note) { <p class="pcl__note">{{ t.note }}</p> }
              </div>
              @switch (t.state) {
                @case ('today') { <span class="pcl__tag pcl__tag--today">Closed today</span> }
                @case ('next') { <span class="pcl__tag pcl__tag--next">{{ t.away }}</span> }
                @case ('past') { <span class="pcl__tag">Over</span> }
              }
            </li>
          }
        </ul>
      } @else {
        <p class="pcl__none"><i class="pi pi-check-circle" aria-hidden="true"></i> No closures in {{ monthTitle }}. School runs as usual.</p>
      }
    </section>
  `,
  styles: [`
    .pcl { background: #fff; border-radius: 16px; border: 1px solid #e6e8ef; overflow: hidden;
      box-shadow: 0 18px 40px -18px rgba(10, 40, 60, 0.45), 0 2px 6px rgba(10, 40, 60, 0.08); }
    .pcl__head { display: flex; align-items: center; gap: 0.9rem; padding: 1.1rem 1.4rem; color: #fff;
      background: linear-gradient(120deg, #0a283c 0%, #12466a 100%); }
    .pcl__head h2 { margin: 0; font-size: clamp(1.05rem, 2.6vw, 1.35rem); color: #fff; text-align: left; }
    .pcl__icon { flex: 0 0 auto; width: 2.6rem; height: 2.6rem; border-radius: 12px; display: grid; place-items: center;
      background: rgba(255, 255, 255, 0.14); font-size: 1.25rem; }
    .pcl__eyebrow { margin: 0 0 0.1rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #ffd58a; }
    .pcl__count { margin-left: auto; padding: 0.3rem 0.75rem; border-radius: 999px; background: #ffd58a; color: #0a283c;
      font-weight: 700; font-size: 0.85rem; white-space: nowrap; }
    .pcl__list { list-style: none; margin: 0; padding: 1rem; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      align-items: start; gap: 0.75rem; }
    .pcl__tile { position: relative; display: flex; align-items: center; gap: 0.85rem; padding: 0.8rem 0.9rem; border-radius: 12px;
      border: 1px solid #e6e8ef; background: #f8f9fc; transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .pcl__tile:hover { transform: translateY(-2px); box-shadow: 0 8px 18px -12px rgba(10, 40, 60, 0.5); }
    .pcl__tile.is-past { opacity: 0.55; background: #fafafa; }
    .pcl__tile.is-past .pcl__date { background: #c8ccd6; }
    .pcl__tile.is-next { border-color: #12466a; background: #eef4fa; }
    .pcl__tile.is-today { border-color: #d9480f; background: #fff4ec; }
    .pcl__tile.is-today .pcl__date { background: #d9480f; }
    .pcl__date { flex: 0 0 auto; min-width: 3.6rem; padding: 0.45rem 0.4rem; border-radius: 10px; background: #12466a; color: #fff;
      text-align: center; line-height: 1.05; }
    .pcl__day { display: block; font-size: 1.35rem; font-weight: 800; }
    .pcl__month { display: block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.85; }
    .pcl__info { min-width: 0; flex: 1; }
    .pcl__name { margin: 0; font-weight: 700; color: #1f2a44; line-height: 1.25;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .pcl__when { margin: 0.15rem 0 0; font-size: 0.82rem; color: #66708a; }
    .pcl__note { margin: 0.15rem 0 0; font-size: 0.8rem; color: #4a5068; }
    .pcl__tag { position: absolute; top: -0.55rem; right: 0.7rem; padding: 0.12rem 0.55rem; border-radius: 999px; font-size: 0.7rem;
      font-weight: 700; background: #8a91a5; color: #fff; }
    .pcl__tag--next { background: #12466a; }
    .pcl__tag--today { background: #d9480f; }
    .pcl__none { margin: 0; padding: 1.1rem 1.4rem; display: flex; align-items: center; gap: 0.5rem; color: #2b6a3f; font-weight: 600; }
    @media (max-width: 560px) {
      .pcl__head { padding: 0.9rem 1rem; }
      .pcl__count { display: none; }
      .pcl__list { padding: 0.9rem 0.75rem; grid-template-columns: 1fr; }
    }
  `]
})
export class PreSchoolClosuresComponent {
  /** The PreSchool's holidays as the public page gives them (from the 1st of this month on). */
  readonly holidays = input<PreSchoolHoliday[]>([]);

  readonly monthTitle = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  /** This month's holidays only, as tiles — the same span the Computer Centre's notice covers. */
  readonly tiles = computed<ClosureTile[]>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime();
    const weekday = (d: Date, style: 'long' | 'short') => d.toLocaleDateString('en-IN', { weekday: style });
    let nextMarked = false;

    return this.holidays()
      .filter(h => parse(h.toDate).getTime() >= monthStart && parse(h.fromDate).getTime() <= monthEnd)
      .map(h => {
        const from = parse(h.fromDate);
        const to = parse(h.toDate);
        const start = from.getTime();
        const end = to.getTime();
        const days = Math.round((end - start) / DAY_MS) + 1;

        let state: ClosureTile['state'] = 'later';
        if (end < today) state = 'past';
        else if (start <= today) state = 'today';
        else if (!nextMarked) state = 'next';
        if (state === 'today' || state === 'next') nextMarked = true;

        const sameMonth = from.getMonth() === to.getMonth();
        const away = Math.round((start - today) / DAY_MS);
        return {
          id: h.id,
          title: h.title,
          note: h.note,
          days,
          dayLabel: days === 1 ? `${from.getDate()}` : `${from.getDate()}–${to.getDate()}${sameMonth ? '' : ' ' + to.toLocaleDateString('en-IN', { month: 'short' })}`,
          monthShort: from.toLocaleDateString('en-IN', { month: 'short' }),
          weekdays: days === 1 ? weekday(from, 'long') : `${weekday(from, 'short')} – ${weekday(to, 'short')} · ${days} days closed`,
          state,
          away: away === 1 ? 'Tomorrow' : `In ${away} days`
        };
      });
  });

  /** Closed days falling in this month. */
  readonly dayCount = computed(() => this.tiles().reduce((n, t) => n + t.days, 0));
}
