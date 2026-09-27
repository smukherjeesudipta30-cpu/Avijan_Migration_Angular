import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';

import { ReportService } from '../../core/services/report.service';

/**
 * Shown wherever a teacher's or receptionist's pay is entered: the monthly pay
 * cycle runs from the 26th of one month to the 25th of the next, not the
 * calendar month — plus the exact dates the entry being made falls in, worked
 * out the same way the server settles pay. The start day is not fixed: it is
 * the payroll setting Admin can change on the Teacher Account report, read
 * fresh each time, so the notice always states the cycle actually in force.
 *
 * Give it `payMonth` (a receptionist's month being paid: September's pay covers
 * 26 Aug – 25 Sep) or `paidOn` (a teacher's payment date: the cycle that date
 * falls in).
 */
@Component({
  selector: 'app-pay-cycle-notice',
  imports: [DatePipe],
  template: `
    <div class="pcn" role="note">
      <i class="pi pi-calendar-clock" aria-hidden="true"></i>
      <div>
        <strong>Monthly pay cycle: {{ ordinal(startDay()) }} to {{ ordinal(endDay()) }} of every month.</strong>
        @if (range(); as r) {
          <span>
            @if (payMonth()) {
              {{ payMonth() | date: 'MMMM y' }} pay covers
            } @else {
              A payment on {{ paidOn() | date: 'd MMM y' }} falls in the cycle
            }
            <b>{{ r.start | date: 'd MMM y' }} – {{ r.end | date: 'd MMM y' }}</b>.
          </span>
        }
      </div>
    </div>
  `,
  styles: `
    .pcn {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      padding: 0.6rem 0.8rem;
      margin: 0 0 0.9rem;
      border: 1px solid color-mix(in srgb, var(--app-brand) 35%, transparent);
      border-left-width: 4px;
      border-radius: var(--app-radius);
      background: color-mix(in srgb, var(--app-brand) 7%, transparent);
      font-size: 0.85rem;
      line-height: 1.45;
    }
    .pcn i { color: var(--app-brand); font-size: 1.05rem; margin-top: 0.1rem; }
    .pcn div { display: grid; gap: 0.15rem; }
    .pcn span { color: var(--app-text-muted); }
  `
})
export class PayCycleNoticeComponent implements OnInit {
  private readonly reports = inject(ReportService);

  /** A receptionist's pay month (any date in it). */
  readonly payMonth = input<Date | null>(null);
  /** A teacher's payment date. */
  readonly paidOn = input<Date | null>(null);

  /** 26 until the setting has loaded — also the fallback for a role that cannot read it. */
  readonly startDay = signal(26);
  readonly endDay = computed(() => (this.startDay() === 1 ? 31 : this.startDay() - 1));

  readonly range = computed(() => {
    const month = this.payMonth();
    if (month) {
      // A pay month's cycle ENDS in that month: September = 26 Aug – 25 Sep.
      return this.cycleContaining(new Date(month.getFullYear(), month.getMonth(), 1));
    }
    const day = this.paidOn();
    return day ? this.cycleContaining(day) : null;
  });

  ngOnInit(): void {
    this.reports.payrollSettings().subscribe({
      next: s => { if (s?.payCycleStartDay) this.startDay.set(s.payCycleStartDay); },
      error: () => { /* keep the default 26th-to-25th */ }
    });
  }

  /** 26 → "26th", 1 → "1st", 22 → "22nd"; 31 stands for "the last day" of the month. */
  ordinal(n: number): string {
    if (n === 31) return 'last day';
    const teen = n % 100 >= 11 && n % 100 <= 13;
    const suffix = !teen && n % 10 === 1 ? 'st' : !teen && n % 10 === 2 ? 'nd' : !teen && n % 10 === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
  }

  /**
   * The cycle containing `anchor` — the same rule as the server's
   * ReceptionistService.PayCycleRange, including clamping the start day to a
   * short month.
   */
  private cycleContaining(anchor: Date): { start: Date; end: Date } {
    const clamp = (y: number, m: number) => Math.min(this.startDay(), new Date(y, m + 1, 0).getDate());
    const y = anchor.getFullYear(), m = anchor.getMonth();

    const prev = new Date(y, m - 1, 1);
    const start = anchor.getDate() >= clamp(y, m)
      ? new Date(y, m, clamp(y, m))
      : new Date(prev.getFullYear(), prev.getMonth(), clamp(prev.getFullYear(), prev.getMonth()));

    // Ends the day before the next cycle starts.
    const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const end = new Date(next.getFullYear(), next.getMonth(), clamp(next.getFullYear(), next.getMonth()) - 1);
    return { start, end };
  }
}
