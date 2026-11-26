import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolMyReferrals, PreSchoolSalaryPayment } from '../../../core/models/preschool-finance.model';
import { monthLabel } from '../../../core/models/preschool-student.model';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { downloadDocumentPdf, isNativeApp, pdfFileName } from '../../../core/printing/pdf-download';
import { preSchoolPayslipHtml } from '../../../core/printing/preschool-payslip';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolFinanceService } from '../../../core/services/preschool-finance.service';

/** A pastel per card, in turn. */
const TINTS = ['#ffe3ec', '#e3f2ff', '#e6f8e6', '#fff1d6'];

/**
 * A PreSchool teacher's or receptionist's own honorarium, month by month,
 * with the reference fees earned for admissions they referred — in the
 * PreSchool's own look. Only their own: the server matches the email on
 * their staff record to their sign-in. Each slip opens to print, or saves
 * as a PDF (always on a phone, where a print window cannot open).
 */
@Component({
  selector: 'app-preschool-my-payslips',
  standalone: true,
  imports: [DatePipe, ButtonModule],
  template: `
    <div class="ph">
      <header class="ph__hero">
        <div>
          <span class="ph__pill">Avijan PreSchool · My honorarium</span>
          <h1>Hello{{ firstName() ? ', ' + firstName() : '' }} <span aria-hidden="true">👋</span></h1>
          <p>Your honorarium for every month, as the PreSchool paid it, and the reference fees you have earned.
            Open a slip to print it or save it as a PDF.</p>
        </div>
        <span class="ph__art" aria-hidden="true">🎒</span>
      </header>

      <div class="ph__stats">
        <div class="ph__stat ph__stat--pink"><span>Last honorarium</span>
          <strong>{{ latest() ? money(latest()!.netPaid) : '—' }}</strong>
          <small>{{ latest() ? label(latest()!.forMonth) + ' · paid ' + (latest()!.paidOn | date: 'd MMM') : 'Nothing paid yet' }}</small></div>
        <div class="ph__stat ph__stat--blue"><span>This year so far</span>
          <strong>{{ money(yearTotal()) }}</strong><small>{{ yearCount() }} month{{ yearCount() === 1 ? '' : 's' }} paid in {{ thisYear }}</small></div>
        <div class="ph__stat ph__stat--green"><span>Reference fees to come</span>
          <strong>{{ money(referrals()?.pending ?? 0) }}</strong><small>added to your next honorarium</small></div>
        <div class="ph__stat ph__stat--sun"><span>Reference fees paid</span>
          <strong>{{ money(referrals()?.paidOut ?? 0) }}</strong><small>for children you referred</small></div>
      </div>

      <section class="ph__section">
        <h2>Monthly honorarium</h2>
        <div class="ph__months">
          @for (p of list(); track p.id; let i = $index) {
            <article class="ph__month" [style.--tint]="tint(i)">
              <div class="ph__month-top">
                <span class="ph__month-name">{{ label(p.forMonth) }}</span>
                <span class="ph__mode">{{ p.mode }}</span>
              </div>
              <strong class="ph__net">{{ money(p.netPaid) }}</strong>
              <ul class="ph__lines">
                <li><span>Honorarium</span><span>{{ money(p.salary) }}</span></li>
                @if (p.deduction) { <li class="ph__minus"><span>Absence ({{ p.daysAbsent }} days)</span><span>− {{ money(p.deduction) }}</span></li> }
                @if (p.referralBonus) { <li class="ph__plus"><span>Reference fees</span><span>+ {{ money(p.referralBonus) }}</span></li> }
              </ul>
              <small class="ph__paid">Paid {{ p.paidOn | date: 'd MMM y' }}</small>
              <div class="ph__btns">
                @if (!asPdf) { <p-button label="Open slip" icon="pi pi-print" size="small" [outlined]="true" (onClick)="open(p)" /> }
                <p-button label="PDF" icon="pi pi-file-pdf" size="small" [outlined]="!asPdf" [loading]="saving() === p.id" (onClick)="pdf(p)" />
              </div>
            </article>
          } @empty {
            @if (loaded()) {
              <div class="ph__empty">
                <span aria-hidden="true">🌱</span>
                <p><strong>No honorarium slips yet.</strong> They appear here once the PreSchool pays you.</p>
                <p class="ph__muted">Been paid and still see nothing? Ask the PreSchool admin to put your sign-in email on your staff record.</p>
              </div>
            } @else {
              <p class="ph__muted"><i class="pi pi-spin pi-spinner"></i> Loading…</p>
            }
          }
        </div>
      </section>

      @if (referrals(); as rf) {
        <section class="ph__section">
          <h2>My reference fees <small>{{ rf.credits.length ? '' : '— none yet' }}</small></h2>
          <p class="ph__muted">For each child you referred, you earn a share of every admission payment their family makes. It is added to your next honorarium.</p>
          @if (rf.credits.length) {
            <div class="ph__refs">
              @for (c of rf.credits; track c.id) {
                <div class="ph__ref">
                  <span class="ph__ref-child"><strong>{{ c.childName }}</strong><small>{{ c.admissionCode }} · {{ c.creditedOn | date: 'd MMM y' }}</small></span>
                  <span class="ph__ref-from">{{ c.percent }}% of {{ money(c.paymentAmount) }}<small>{{ c.receiptCode }}@if (c.instalmentNo > 1) { · instalment {{ c.instalmentNo }} }</small></span>
                  <strong class="ph__ref-amt">{{ money(c.amount) }}</strong>
                  @if (c.paidWithSalaryFor) { <span class="ph__chip ph__chip--paid">Paid · {{ label(c.paidWithSalaryFor) }}</span> }
                  @else { <span class="ph__chip ph__chip--due">Next honorarium</span> }
                </div>
              }
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ph { font-family: 'Nunito', 'Segoe UI', system-ui, sans-serif; color: #2a2f45; max-width: 64rem; }
    .ph__hero { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1.4rem 1.6rem;
      border-radius: 28px; background: radial-gradient(circle at 85% 30%, #ffd6e7, #fff3e0 45%, #fffaf3 75%); overflow: hidden; }
    .ph__hero::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 6px;
      background: linear-gradient(90deg, #ff6b8b, #ffb347 35%, #6cc56c 65%, #4aa3ff); }
    .ph__pill { display: inline-block; padding: 0.25rem 0.8rem; border-radius: 999px; background: #ffe3ec; color: #b3264f; font-weight: 800; font-size: 0.78rem; }
    .ph__hero h1 { margin: 0.6rem 0 0.3rem; font-size: clamp(1.6rem, 4vw, 2.2rem); }
    .ph__hero p { margin: 0; color: #4a5068; max-width: 36rem; line-height: 1.5; }
    .ph__art { font-size: 3.6rem; transform: rotate(-8deg); }
    .ph__stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.8rem; margin: 1rem 0 0.4rem; }
    .ph__stat { padding: 0.9rem 1.1rem; border-radius: 20px; }
    .ph__stat span, .ph__stat small { display: block; font-size: 0.8rem; color: #5b6178; font-weight: 700; }
    .ph__stat small { font-weight: 600; }
    .ph__stat strong { display: block; font-size: 1.5rem; margin: 0.15rem 0; }
    .ph__stat--pink { background: #ffe3ec; } .ph__stat--pink strong { color: #b3264f; }
    .ph__stat--blue { background: #e3f2ff; } .ph__stat--blue strong { color: #1d5fa8; }
    .ph__stat--green { background: #e6f8e6; } .ph__stat--green strong { color: #2b7a2b; }
    .ph__stat--sun { background: #fff1d6; } .ph__stat--sun strong { color: #9a5b00; }
    .ph__section { margin-top: 1.4rem; }
    .ph__section h2 { margin: 0 0 0.6rem; font-size: 1.25rem; }
    .ph__section h2 small { font-size: 0.85rem; color: #8a8fa3; font-weight: 600; }
    .ph__months { display: grid; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); gap: 0.9rem; }
    .ph__month { position: relative; padding: 1rem 1.1rem; border-radius: 22px; background: #fff; border: 2px solid var(--tint);
      box-shadow: 0 8px 22px rgba(42, 47, 69, 0.06); }
    .ph__month::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 2.6rem; border-radius: 20px 20px 0 0; background: var(--tint); z-index: 0; }
    .ph__month > * { position: relative; z-index: 1; }
    .ph__month-top { display: flex; justify-content: space-between; align-items: center; }
    .ph__month-name { font-weight: 800; font-size: 1.05rem; }
    .ph__mode { padding: 0.1rem 0.6rem; border-radius: 999px; background: rgba(255, 255, 255, 0.85); font-size: 0.75rem; font-weight: 800; }
    .ph__net { display: block; margin: 0.9rem 0 0.4rem; font-size: 1.6rem; color: #b3264f; }
    .ph__lines { list-style: none; margin: 0; padding: 0; font-size: 0.86rem; }
    .ph__lines li { display: flex; justify-content: space-between; padding: 0.2rem 0; border-bottom: 1px dashed #f0e4ea; }
    .ph__minus span:last-child { color: #b42318; font-weight: 700; }
    .ph__plus span:last-child { color: #2b7a2b; font-weight: 700; }
    .ph__paid { display: block; margin-top: 0.45rem; color: #8a8fa3; font-size: 0.78rem; font-weight: 600; }
    .ph__btns { display: flex; gap: 0.4rem; margin-top: 0.7rem; flex-wrap: wrap; }
    .ph__empty { grid-column: 1 / -1; padding: 1.4rem; border-radius: 22px; background: #fff; border: 2px dashed #ffc2d1; text-align: center; }
    .ph__empty span { font-size: 2.4rem; }
    .ph__empty p { margin: 0.4rem 0 0; }
    .ph__muted { color: #6b7088; font-size: 0.86rem; margin: 0 0 0.6rem; }
    .ph__refs { display: flex; flex-direction: column; gap: 0.5rem; }
    .ph__ref { display: grid; grid-template-columns: 1.4fr 1.2fr auto auto; gap: 0.8rem; align-items: center; padding: 0.7rem 1rem;
      border-radius: 18px; background: #fff; border: 1px solid #f1e4ea; }
    .ph__ref small { display: block; color: #8a8fa3; font-size: 0.76rem; font-weight: 600; }
    .ph__ref-from { font-size: 0.86rem; }
    .ph__ref-amt { font-size: 1.1rem; color: #2b7a2b; }
    .ph__chip { padding: 0.2rem 0.7rem; border-radius: 999px; font-size: 0.75rem; font-weight: 800; white-space: nowrap; }
    .ph__chip--paid { background: #e6f8e6; color: #2b7a2b; }
    .ph__chip--due { background: #fff1d6; color: #9a5b00; }
    @media (max-width: 640px) {
      .ph__hero { padding: 1.1rem; } .ph__art { display: none; }
      .ph__ref { grid-template-columns: 1fr auto; } .ph__ref-from { display: none; }
    }
  `]
})
export class PreSchoolMyPayslipsComponent implements OnInit {
  private readonly finance = inject(PreSchoolFinanceService);
  private readonly messages = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly list = signal<PreSchoolSalaryPayment[]>([]);
  readonly loaded = signal(false);
  readonly referrals = signal<PreSchoolMyReferrals | null>(null);
  readonly saving = signal<number | null>(null);
  readonly money = formatMoney;
  readonly label = monthLabel;
  readonly thisYear = new Date().getFullYear();
  /** A phone (or the app) cannot print from a pop-up window: there the slip is saved as a PDF. */
  readonly asPdf = isNativeApp() || window.matchMedia?.('(max-width: 820px), (pointer: coarse)').matches === true;

  readonly firstName = computed(() => (this.auth.user()?.name ?? '').trim().split(/\s+/)[0] ?? '');
  readonly latest = computed(() => this.list()[0] ?? null);
  private readonly thisYearSlips = computed(() => this.list().filter(p => p.forMonth.startsWith(`${this.thisYear}-`)));
  readonly yearTotal = computed(() => this.thisYearSlips().reduce((t, p) => t + p.netPaid, 0));
  readonly yearCount = computed(() => this.thisYearSlips().length);

  ngOnInit(): void {
    this.finance.myPayslips().subscribe({
      next: l => { this.list.set(l); this.loaded.set(true); },
      error: () => this.loaded.set(true)
    });
    this.finance.myReferrals().subscribe({ next: r => this.referrals.set(r), error: () => undefined });
  }

  tint(i: number): string { return TINTS[i % TINTS.length]; }

  open(p: PreSchoolSalaryPayment): void {
    const win = openPendingDocumentWindow(780, 960);
    if (!writeDocumentWindow(win, preSchoolPayslipHtml(p))) this.pdf(p);
  }

  pdf(p: PreSchoolSalaryPayment): void {
    this.saving.set(p.id);
    downloadDocumentPdf(preSchoolPayslipHtml(p, true), pdfFileName('Honorarium', p.staffName, p.forMonth.slice(0, 7)), { width: 794 })
      .catch(() => this.messages.add({ severity: 'warn', summary: 'The PDF could not be made', detail: 'Please try again.', life: 4500 }))
      .finally(() => this.saving.set(null));
  }
}
