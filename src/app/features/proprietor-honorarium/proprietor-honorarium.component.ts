import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { BranchListItem } from '../../core/models/master.model';
import { AuthService } from '../../core/services/auth.service';
import { MasterService } from '../../core/services/master.service';
import { ReportService } from '../../core/services/report.service';

/** One month's charge for one branch (or the whole institute), for the month-wise view. */
interface MonthRow {
  /** First day of the month the pay cycle is named after. */
  month: Date;
  start: Date;
  end: Date;
  branch: string | null;
  amount: number;
  note: string | null;
  /** The month of the entry this amount comes from. */
  from: Date;
  /** The pay cycle running today — not complete, so not totalled. */
  running: boolean;
}

interface HonorariumEntry {
  id: number;
  /** Null/absent = the whole institute. */
  branch?: string | null;
  effectiveFrom: string;
  monthlyAmount: number;
  note?: string;
  createdBy?: string;
  createdOn: string;
}

interface HonorariumCurrent {
  branch?: string | null;
  monthlyAmount: number;
}

interface Honorarium {
  /** Total in force this month, across every branch and the whole-institute amount. */
  currentMonthlyAmount: number | null;
  currentByBranch: HonorariumCurrent[];
  history: HonorariumEntry[];
}

/**
 * The proprietor's monthly honorarium. Admin sets it; Admin, Editor and
 * SuperAdmin can see it. Each amount is charged to one branch — and shows in
 * that branch's Income report — or, with no branch, to the whole institute.
 * The whole-institute report deducts all of them.
 */
@Component({
  selector: 'app-proprietor-honorarium',
  imports: [
    CommonModule, FormsModule, ButtonModule, DatePickerModule, InputNumberModule, InputTextModule, SelectModule,
    SelectButtonModule, TableModule
  ],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Finance</span>
      <h1>Proprietor honorarium</h1>
      <p class="app-muted">
        A monthly amount deducted from net profit in the Income report, month by month. Charge it to a
        branch and it appears in that branch's report; leave the branch empty to charge the whole institute.
        The whole-institute report always includes every amount.
      </p>
    </div>

    <section class="app-card ph__card">
      <span class="app-muted">Current monthly honorarium (total)</span>
      <strong class="ph__current">
        {{ data()?.currentMonthlyAmount != null ? money(data()!.currentMonthlyAmount!) : 'Not set' }}
      </strong>
      @if ((data()?.currentByBranch?.length ?? 0) > 0) {
        <ul class="ph__split">
          @for (c of data()!.currentByBranch; track c.branch) {
            <li>
              <span>{{ c.branch || 'Whole institute' }}</span>
              <strong>{{ money(c.monthlyAmount) }}</strong>
            </li>
          }
        </ul>
      }
    </section>

    @if (isAdmin()) {
      <section class="app-card ph__card">
        <h2>Set the amount</h2>
        <div class="ph__form">
          <label>Branch
            <p-select
              [options]="branches()"
              optionLabel="name"
              optionValue="name"
              [(ngModel)]="branch"
              [showClear]="true"
              placeholder="Whole institute"
              appendTo="body"
              styleClass="ph__branch" />
          </label>
          <label>From month
            <p-datepicker [(ngModel)]="month" view="month" dateFormat="MM yy" [showIcon]="true" appendTo="body" />
          </label>
          <label>Monthly amount
            <p-inputNumber [(ngModel)]="amount" [min]="0" mode="currency" currency="INR" locale="en-IN" />
          </label>
          <label class="ph__note">Note (optional)
            <input pInputText [(ngModel)]="note" />
          </label>
          <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="amount === null || !month"
                    (onClick)="save()" />
        </div>
        <p class="app-muted ph__hint">
          Applies to that branch from that month until you set a new amount for the same branch, so earlier
          months keep what they had. Set 0 to stop it.
        </p>
      </section>
    }

    <section class="app-card ph__card">
      <div class="ph__head">
        <h2>{{ view() === 'months' ? 'Month-wise' : 'Changes' }}</h2>
        <p-selectbutton
          [options]="viewOptions"
          [ngModel]="view()"
          (ngModelChange)="view.set($event)"
          optionLabel="label"
          optionValue="value"
          [allowEmpty]="false" />
      </div>

      @if (view() === 'months') {
        <div class="ph__months-bar">
          <label>Year
            <p-select [options]="yearOptions()" optionLabel="label" optionValue="value"
                      [ngModel]="year()" (ngModelChange)="year.set($event)" appendTo="body" styleClass="ph__year" />
          </label>
          <span class="app-muted ph__hint">
            Each month is one pay cycle ({{ ordinal(cycleStartDay()) }} to {{ ordinal(cycleEndDay()) }}), named by the
            month it ends in — the same months the Income report charges.
          </span>
        </div>

        <p-table [value]="visibleMonths()" styleClass="p-datatable-sm" [rowTrackBy]="trackMonth">
          <ng-template pTemplate="header">
            <tr>
              <th>Month</th>
              <th>Pay cycle</th>
              <th>Branch</th>
              <th class="ph__num">Amount</th>
              <th>From entry</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr [class.ph__row--zero]="r.amount === 0" [class.ph__row--running]="r.running">
              <td>
                <strong>{{ r.month | date: 'MMMM y' }}</strong>
                @if (r.running) { <span class="ph__tag">in progress</span> }
              </td>
              <td class="app-muted">{{ r.start | date: 'd MMM y' }} – {{ r.end | date: 'd MMM y' }}</td>
              <td>{{ r.branch || 'Whole institute' }}</td>
              <td class="ph__num">
                @if (r.amount === 0) { <span class="app-muted">Stopped (₹0)</span> }
                @else { <strong>{{ money(r.amount) }}</strong> }
              </td>
              <td class="app-muted">{{ r.note || ('set from ' + (r.from | date: 'MMM y')) }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="footer">
            @if (visibleMonths().length) {
              <tr class="ph__total">
                <td colspan="3">
                  Total {{ year() === 'all' ? 'all years' : year() }}
                  <span class="app-muted">· {{ paidMonths() }} month(s) charged</span>
                </td>
                <td class="ph__num">{{ money(visibleTotal()) }}</td>
                <td></td>
              </tr>
            }
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="5" class="app-muted">No honorarium in this period.</td></tr>
          </ng-template>
        </p-table>

        @if (year() === 'all' && yearTotals().length > 1) {
          <ul class="ph__split ph__years">
            @for (y of yearTotals(); track y.year) {
              <li><span>{{ y.year }} <span class="app-muted">({{ y.months }} months)</span></span><strong>{{ money(y.total) }}</strong></li>
            }
          </ul>
        }
      } @else {
      <p-table [value]="data()?.history ?? []" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Branch</th>
            <th>From month</th>
            <th class="ph__num">Monthly amount</th>
            <th>Note</th>
            <th>Set by</th>
            @if (isAdmin()) { <th style="width: 4rem"></th> }
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-h>
          <tr>
            <td>{{ h.branch || 'Whole institute' }}</td>
            <td>{{ h.effectiveFrom | date: 'MMMM y' }}</td>
            <td class="ph__num"><strong>{{ money(h.monthlyAmount) }}</strong></td>
            <td>{{ h.note || '—' }}</td>
            <td>{{ h.createdBy || '—' }} <span class="app-muted">· {{ h.createdOn | date: 'd MMM y' }}</span></td>
            @if (isAdmin()) {
              <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="remove(h)" /></td>
            }
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="6" class="app-muted">No honorarium set yet.</td></tr>
        </ng-template>
      </p-table>
      <p class="app-muted ph__hint">
        Each change applies from its month until the next change for the same branch — see Month-wise for every month.
      </p>
      }
    </section>
  `,
  styles: `
    .ph__card { margin-bottom: 1rem; }
    .ph__card h2 { margin: 0 0 0.7rem; font-size: 1.05rem; }
    .ph__current { display: block; font-size: 1.6rem; margin-top: 0.3rem; }
    .ph__form { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: flex-end; }
    .ph__form label { display: grid; gap: 0.3rem; font-size: 0.8rem; }
    .ph__note { min-width: 14rem; flex: 1; }
    .ph__hint { font-size: 0.8rem; margin: 0.6rem 0 0; }
    .ph__num { text-align: right; }
    .ph__split { list-style: none; margin: 0.7rem 0 0; padding: 0.6rem 0 0; border-top: 1px solid var(--app-border); display: grid; gap: 0.3rem; }
    .ph__split li { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.85rem; max-width: 22rem; }
    :host ::ng-deep .ph__branch { min-width: 12rem; }
    .ph__head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
    .ph__head h2 { margin: 0; }
    .ph__months-bar { display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
    .ph__months-bar label { display: grid; gap: 0.3rem; font-size: 0.8rem; }
    .ph__months-bar .ph__hint { margin: 0 0 0.4rem; }
    :host ::ng-deep .ph__year { min-width: 9rem; }
    .ph__row--zero td { color: var(--app-text-muted); }
    .ph__tag { margin-left: 0.4rem; padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.7rem; background: color-mix(in srgb, var(--app-brand) 12%, transparent); color: var(--app-brand); }
    .ph__total td { font-weight: 700; border-top: 2px solid var(--app-border); }
    .ph__years { max-width: 26rem; }
  `
})
export class ProprietorHonorariumComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly masters = inject(MasterService);
  private readonly reports = inject(ReportService);
  private readonly base = `${environment.apiBaseUrl}/proprietor-honorarium`;

  readonly data = signal<Honorarium | null>(null);
  readonly saving = signal(false);
  readonly branches = signal<BranchListItem[]>([]);
  readonly isAdmin = computed(() => this.auth.hasAnyRole(['Admin', 'SuperAdmin']));

  /** Null = the whole institute. */
  branch: string | null = null;
  month: Date | null = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  amount: number | null = null;
  note = '';

  /* ------------------------------------------------------------ month-wise */

  readonly view = signal<'months' | 'changes'>('months');
  readonly viewOptions = [
    { label: 'Month-wise', value: 'months' },
    { label: 'Changes', value: 'changes' }
  ];

  /** The pay cycle start day (26 unless Admin changed it) — months are pay cycles, as in the Income report. */
  readonly cycleStartDay = signal(26);
  readonly cycleEndDay = computed(() => (this.cycleStartDay() === 1 ? 31 : this.cycleStartDay() - 1));

  readonly year = signal<number | 'all'>(new Date().getFullYear());

  /**
   * Every month from the first entry up to the running pay cycle, once per
   * branch, with the amount in force that month: the latest entry for that
   * branch starting on or before it. Newest month first.
   */
  readonly months = computed<MonthRow[]>(() => {
    const history = this.data()?.history ?? [];
    if (!history.length) return [];

    const lastMonth = this.labelMonth(new Date());
    const rows: MonthRow[] = [];
    const byBranch = new Map<string, HonorariumEntry[]>();
    for (const h of history) {
      const key = h.branch ?? '';
      byBranch.set(key, [...(byBranch.get(key) ?? []), h]);
    }

    for (const [key, entries] of byBranch) {
      const sorted = [...entries].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      const first = this.parseMonth(sorted[0].effectiveFrom);
      for (let m = first; m <= lastMonth; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
        const iso = this.isoMonth(m);
        const entry = [...sorted].reverse().find(e => e.effectiveFrom.slice(0, 7) <= iso.slice(0, 7));
        if (!entry) continue;
        const { start, end } = this.cycleRange(m);
        rows.push({
          month: m, start, end, branch: key || null, amount: entry.monthlyAmount,
          note: entry.note ?? null, from: this.parseMonth(entry.effectiveFrom),
          running: m.getTime() === lastMonth.getTime()
        });
      }
    }
    return rows.sort((a, b) => b.month.getTime() - a.month.getTime() || (a.branch ?? '').localeCompare(b.branch ?? ''));
  });

  readonly yearOptions = computed(() => {
    const years = [...new Set(this.months().map(r => r.month.getFullYear()))].sort((a, b) => b - a);
    if (!years.length) years.push(new Date().getFullYear());
    return [...years.map(y => ({ label: String(y), value: y as number | 'all' })), { label: 'All years', value: 'all' as const }];
  });

  readonly visibleMonths = computed(() => {
    const y = this.year();
    return y === 'all' ? this.months() : this.months().filter(r => r.month.getFullYear() === y);
  });

  /** The running cycle is not complete, so like the Income report its amount is shown but not totalled. */
  readonly visibleTotal = computed(() => this.visibleMonths().filter(r => !r.running).reduce((a, r) => a + r.amount, 0));
  readonly paidMonths = computed(() => this.visibleMonths().filter(r => !r.running && r.amount > 0).length);

  readonly yearTotals = computed(() => {
    const map = new Map<number, { total: number; months: number }>();
    for (const r of this.months()) {
      if (r.running) continue;
      const t = map.get(r.month.getFullYear()) ?? { total: 0, months: 0 };
      t.total += r.amount;
      if (r.amount > 0) t.months++;
      map.set(r.month.getFullYear(), t);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]).map(([year, t]) => ({ year, ...t }));
  });

  readonly trackMonth = (_: number, r: MonthRow) => `${r.month.getTime()}|${r.branch ?? ''}`;

  ordinal(n: number): string {
    if (n === 31) return 'last day';
    const teen = n % 100 >= 11 && n % 100 <= 13;
    return `${n}${!teen && n % 10 === 1 ? 'st' : !teen && n % 10 === 2 ? 'nd' : !teen && n % 10 === 3 ? 'rd' : 'th'}`;
  }

  /** The month the pay cycle running on `day` ends in — its name (same rule as the server's PayCycles). */
  private labelMonth(day: Date): Date {
    const s = this.cycleStartDay();
    const m = new Date(day.getFullYear(), day.getMonth(), 1);
    return s > 1 && day.getDate() >= s ? new Date(m.getFullYear(), m.getMonth() + 1, 1) : m;
  }

  private cycleRange(month: Date): { start: Date; end: Date } {
    const s = this.cycleStartDay();
    const y = month.getFullYear(), mo = month.getMonth();
    if (s <= 1) return { start: new Date(y, mo, 1), end: new Date(y, mo + 1, 0) };
    const prevDays = new Date(y, mo, 0).getDate(), days = new Date(y, mo + 1, 0).getDate();
    return { start: new Date(y, mo - 1, Math.min(s, prevDays)), end: new Date(y, mo, Math.min(s - 1, days)) };
  }

  private parseMonth(iso: string): Date {
    const [y, m] = iso.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }

  private isoMonth(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  ngOnInit(): void {
    this.http.get<ApiResponse<Honorarium>>(this.base).pipe(map(r => r.data))
      .subscribe({ next: d => this.data.set(d) });

    // Editors cannot read payroll settings; they keep the default 26th-to-25th.
    this.reports.payrollSettings().subscribe({
      next: s => { if (s?.payCycleStartDay) this.cycleStartDay.set(s.payCycleStartDay); },
      error: () => {}
    });

    this.masters.branches().subscribe({
      next: rows => this.branches.set(rows.filter(b => b.isActive))
    });
  }

  save(): void {
    if (!this.month || this.amount === null) return;
    const m = this.month;
    const effectiveFrom = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
    this.saving.set(true);
    this.http.put<ApiResponse<Honorarium>>(this.base, {
      effectiveFrom, monthlyAmount: this.amount, note: this.note, branch: this.branch
    })
      .subscribe({
        next: r => {
          this.saving.set(false);
          this.data.set(r.data);
          this.note = '';
          this.messages.add({ severity: 'success', summary: 'Honorarium saved', life: 3000 });
        },
        error: () => this.saving.set(false)
      });
  }

  remove(h: HonorariumEntry): void {
    this.http.delete<ApiResponse<Honorarium>>(`${this.base}/${h.id}`)
      .subscribe({ next: r => this.data.set(r.data) });
  }

  money(v: number): string {
    return '₹' + (v ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
}
