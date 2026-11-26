import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolClass, todayIso } from '../../../core/models/preschool.model';
import {
  PreSchoolPayMode, PreSchoolPendingRow, PreSchoolReceipt, monthLabel, whatsAppLink
} from '../../../core/models/preschool-student.model';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { downloadSizedPdf, isNativeApp, pdfFileName } from '../../../core/printing/pdf-download';
import { feeReceiptHtml } from '../../../core/printing/preschool-forms';
import { emailReceiptToGuardian } from '../../../core/printing/preschool-receipt-mail';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolStudentService } from '../../../core/services/preschool-student.service';

/** "2026-11-01" plus n months. */
function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-01`;
}

/** One child's line on the page: the months ticked, how they are paying, and the receipt once collected. */
interface Line {
  row: PreSchoolPendingRow;
  picked: Set<string>;
  mode: PreSchoolPayMode;
  reference: string;
  busy: boolean;
  receipt: PreSchoolReceipt | null;
  /** What happened to the copy for the guardian's email. */
  mail: string | null;
  /** Brought up by its registration number. */
  found?: boolean;
  /** The amount taken for each ticked month; less than the fee is a concession. */
  amounts: Record<string, number | null>;
  /** The day the money was received; the page's date unless changed for this child. */
  receivedOn: string;
}

/**
 * Monthly fees for every child, on one page: each child's unpaid months with
 * a tick for each, paid in cash, into the bank or by UPI, and the receipt
 * straight away. The receipt records who collected it. Admission fees and
 * instalments are taken on the child's own page.
 */
@Component({
  selector: 'app-preschool-monthly-fees',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>Collect monthly fees</h1>
      <p class="app-muted">Enter the child's registration number, or pick from everyone with months unpaid. Tick the months, choose Cash, Bank or UPI, and collect.</p>
    </div>

    <div class="app-card pmf-reg">
      <label for="pmf-reg">Registration No.</label>
      <div class="pmf-reg-row">
        <span class="pmf-prefix">{{ prefix() }}-</span>
        <input id="pmf-reg" pInputText inputmode="numeric" [(ngModel)]="regNo" (keyup.enter)="findByRegNo()" placeholder="e.g. 12" maxlength="12" />
        <p-button label="Find" icon="pi pi-search" [loading]="finding()" (onClick)="findByRegNo()" />
      </div>
      <small class="app-muted">Shows that child's unpaid months and the next months, to pay ahead.</small>
    </div>

    <div class="app-card pmf-bar">
      <label>Class
        <select [(ngModel)]="classId" (ngModelChange)="load()">
          <option [ngValue]="null">All classes</option>
          @for (c of classes(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
        </select></label>
      <label>Search <input pInputText [ngModel]="searchText()" (ngModelChange)="searchText.set($event)" placeholder="Child, parent or phone" /></label>
      <label>Date received (everyone) <input pInputText type="date" [ngModel]="receivedOn" (ngModelChange)="setAllDates($event)" [max]="today" /></label>
      <label>Mode for everyone
        <select [ngModel]="defaultMode" (ngModelChange)="setAllModes($event)">
          @for (m of modes; track m) { <option [value]="m">{{ m }}</option> }
        </select></label>
    </div>

    <div class="pmf-stats">
      <span><strong>{{ shown().length }}</strong> children with months due</span>
      <span>Ticked now: <strong>{{ money(tickedTotal()) }}</strong></span>
      <span>Collected on this page: <strong>{{ money(collected()) }}</strong></span>
    </div>

    <div class="pmf-list">
      @for (l of shown(); track l.row.studentId) {
        <div class="app-card pmf-line" [class.pmf-line--done]="l.receipt" [class.pmf-line--found]="l.found">
          <div class="pmf-who">
            <a [routerLink]="['/preschool/students', l.row.studentId]"><strong>{{ l.row.childName }}</strong></a>
            <small>{{ l.row.admissionCode }} · {{ l.row.className }} · {{ l.row.parentName }} · <a [href]="'tel:' + l.row.phone">{{ l.row.phone }}</a></small>
            @if (l.row.admissionDue > 0 || (l.row.instalmentDue ?? 0) > 0) {
              <small class="pmf-other">Also due:
                @if (l.row.admissionDue > 0) { admission {{ money(l.row.admissionDue) }} }
                @if ((l.row.instalmentDue ?? 0) > 0) { instalment {{ money(l.row.instalmentDue ?? 0) }} }
                — on the child's page</small>
            }
          </div>

          @if (l.receipt; as r) {
            <div class="pmf-done">
              <span><i class="pi pi-check-circle" aria-hidden="true"></i> {{ money(r.total) }} received · <strong>{{ r.receiptCode }}</strong> · {{ r.mode }}
                @if (l.mail) { <small class="pmf-mail"><i class="pi pi-envelope" aria-hidden="true"></i> {{ l.mail }}</small> }</span>
              <span class="pmf-done-actions">
                <p-button icon="pi pi-print" label="Print" size="small" [text]="true" (onClick)="print(r)" />
                <p-button icon="pi pi-file-pdf" label="PDF" size="small" [text]="true" (onClick)="pdf(r)" />
                <a class="pmf-wa" [href]="share(l.row, r)" target="_blank" rel="noopener"><i class="pi pi-whatsapp" aria-hidden="true"></i> Send</a>
                <p-button icon="pi pi-trash" label="Delete" size="small" [text]="true" severity="danger" [loading]="l.busy"
                  (onClick)="undo(l)" />
              </span>
            </div>
          } @else {
            <div class="pmf-months" role="group" [attr.aria-label]="'Months for ' + l.row.childName">
              @for (m of l.row.months; track m) {
                <span class="pmf-month-box" [class.on]="l.picked.has(m)">
                  <label class="pmf-month" [class.on]="l.picked.has(m)">
                    <input type="checkbox" [checked]="l.picked.has(m)" (change)="toggle(l, m)" />{{ label(m) }}</label>
                  @if (l.picked.has(m)) {
                    <span class="pmf-amt-in">₹<input type="number" min="0" [max]="l.row.monthlyFee" step="1" [ngModel]="l.amounts[m]"
                      (ngModelChange)="setAmount(l, m, $event)" [attr.aria-label]="'Amount for ' + label(m)" /></span>
                    @if ((l.amounts[m] ?? l.row.monthlyFee) < l.row.monthlyFee) {
                      <small class="pmf-conc">concession {{ money(l.row.monthlyFee - (l.amounts[m] ?? 0)) }}</small>
                    }
                  }
                </span>
              }
            </div>
            <div class="pmf-pay">
              <input class="pmf-date" type="date" [(ngModel)]="l.receivedOn" [max]="today" [attr.aria-label]="'Date received for ' + l.row.childName" />
              <select [(ngModel)]="l.mode" [attr.aria-label]="'Mode for ' + l.row.childName">
                @for (m of modes; track m) { <option [value]="m">{{ m }}</option> }
              </select>
              @if (l.mode !== 'Cash') {
                <input pInputText [(ngModel)]="l.reference" maxlength="60"
                  [placeholder]="l.mode === 'Bank' ? 'Bank ref / UTR (optional)' : 'UPI reference'" [attr.aria-label]="'Reference for ' + l.row.childName" />
              }
              <strong class="pmf-amt">{{ money(lineTotal(l)) }}</strong>
              <p-button label="Collect" icon="pi pi-check" size="small" [loading]="l.busy" [disabled]="!l.picked.size" (onClick)="collect(l)" />
            </div>
          }
        </div>
      } @empty {
        @if (loaded()) { <p class="app-muted pmf-empty">No monthly fees are due{{ classId ? ' in this class' : '' }}. 🎉</p> }
        @else { <p class="app-muted pmf-empty"><i class="pi pi-spin pi-spinner"></i> Loading…</p> }
      }
    </div>
  `,
  styles: [`
    .pmf-bar { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: flex-end; padding: 0.85rem 1rem; margin: 0.5rem 0 0.75rem; }
    .pmf-bar label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; font-weight: 600; }
    .pmf-bar select, .pmf-pay select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .pmf-stats { display: flex; gap: 1.2rem; flex-wrap: wrap; margin: 0 0 0.6rem; font-size: 0.88rem; color: var(--app-text-muted); }
    .pmf-stats strong { color: var(--app-text, #1f2430); }
    .pmf-list { display: flex; flex-direction: column; gap: 0.6rem; }
    .pmf-line { display: grid; grid-template-columns: minmax(12rem, 1.1fr) minmax(0, 1.4fr) auto; gap: 0.75rem; align-items: center; padding: 0.75rem 1rem; }
    .pmf-line--done { grid-template-columns: minmax(12rem, 1.1fr) minmax(0, 2fr); background: #f3fbf3; }
    .pmf-who a { color: inherit; text-decoration: none; }
    .pmf-who small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .pmf-other { color: #9a5b00 !important; }
    .pmf-months { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .pmf-month { position: relative; padding: 0.3rem 0.6rem; border: 2px solid #e4e6ef; border-radius: 999px; font-size: 0.8rem; font-weight: 700; cursor: pointer; }
    .pmf-month input { position: absolute; opacity: 0; pointer-events: none; }
    .pmf-month.on { border-color: #ff6b8b; background: #fff0f4; }
    .pmf-month-box { display: inline-flex; flex-direction: column; align-items: center; gap: 0.2rem; }
    .pmf-amt-in { display: inline-flex; align-items: center; gap: 0.15rem; font-size: 0.8rem; font-weight: 700; }
    .pmf-amt-in input { width: 5.2rem; padding: 0.2rem 0.35rem; border: 1px solid var(--app-border); border-radius: 6px; font: inherit; text-align: right; }
    .pmf-conc { font-size: 0.68rem; color: #9a5b00; font-weight: 700; }
    .pmf-pay { display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
    .pmf-pay input { width: 11rem; }
    .pmf-pay input.pmf-date { width: 9.5rem; padding: 0.45rem 0.5rem; border: 1px solid var(--app-border); border-radius: 6px; font: inherit; }
    .pmf-amt { min-width: 5rem; text-align: right; }
    .pmf-done { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; color: #2b7a2b; font-weight: 600; }
    .pmf-done-actions { display: flex; align-items: center; gap: 0.2rem; }
    .pmf-wa { display: inline-flex; gap: 0.3rem; align-items: center; color: #1f9d55; text-decoration: none; font-weight: 700; font-size: 0.85rem; padding: 0 0.5rem; }
    .pmf-empty { padding: 1rem; }
    .pmf-reg { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.9rem 1rem; margin: 0.5rem 0 0.6rem; border: 2px solid #ffc2d1; }
    .pmf-reg label { font-weight: 800; }
    .pmf-reg-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .pmf-reg-row input { width: 10rem; font-size: 1.1rem; font-weight: 700; }
    .pmf-prefix { font-family: ui-monospace, Consolas, monospace; font-weight: 700; color: #4c1d95; }
    .pmf-line--found { border: 2px solid #ff6b8b; }
    .pmf-mail { display: block; font-weight: 500; font-size: 0.78rem; color: var(--app-text-muted); }
    @media (max-width: 900px) {
      .pmf-line, .pmf-line--done { grid-template-columns: 1fr; }
      .pmf-pay { justify-content: flex-start; }
    }
  `]
})
export class PreSchoolMonthlyFeesComponent implements OnInit {
  private readonly students = inject(PreSchoolStudentService);
  private readonly preschool = inject(PreSchoolService);
  private readonly messages = inject(MessageService);

  /** The modes offered here: cash at the desk, into the bank, or by UPI. */
  readonly modes: PreSchoolPayMode[] = ['Cash', 'Bank', 'UPI'];
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly lines = signal<Line[]>([]);
  readonly loaded = signal(false);
  readonly money = formatMoney;
  readonly label = monthLabel;
  readonly today = todayIso();

  classId: number | null = null;
  receivedOn = todayIso();
  defaultMode: PreSchoolPayMode = 'Cash';
  readonly searchText = signal('');
  /** Bumped on every tick, so the totals recompute (the ticked months are a plain Set). */
  private readonly ticks = signal(0);

  readonly shown = computed(() => {
    this.ticks();
    const q = this.searchText().trim().toLowerCase();
    return this.lines().filter(l => !q || [l.row.childName, l.row.parentName, l.row.phone, l.row.admissionCode]
      .some(v => (v ?? '').toLowerCase().includes(q)));
  });
  readonly tickedTotal = computed(() => {
    this.ticks();
    return this.lines().filter(l => !l.receipt).reduce((t, l) => t + this.lineTotal(l), 0);
  });
  readonly collected = computed(() => {
    this.ticks();
    return this.lines().reduce((t, l) => t + (l.receipt?.total ?? 0), 0);
  });

  readonly prefix = signal('APS');
  readonly finding = signal(false);
  regNo = '';

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => {
      this.classes.set(o.classes);
      this.prefix.set(o.settings.receiptPrefix || 'APS');
    });
    this.load();
  }

  /** Brings up one child by registration (admission) number: their unpaid months and the next ones, to pay ahead. */
  findByRegNo(): void {
    const no = Number((this.regNo || '').replace(/\D/g, ''));
    if (!no) {
      this.messages.add({ severity: 'warn', summary: 'Please check', detail: 'Enter the registration number.', life: 4000 });
      return;
    }
    const code = `${this.prefix()}-${String(no).padStart(4, '0')}`;
    this.finding.set(true);
    this.students.list({ search: String(no), classId: null, status: '' }).subscribe({
      next: found => {
        const match = found.find(s => s.admissionCode.toUpperCase() === code.toUpperCase());
        if (!match) {
          this.finding.set(false);
          this.messages.add({ severity: 'warn', summary: 'Not found', detail: `No child with registration number ${code}.`, life: 4500 });
          return;
        }
        this.students.get(match.id).subscribe({
          next: s => {
            this.finding.set(false);
            const unpaid = s.months.filter(m => !m.isPaid).map(m => m.month);
            const ahead: string[] = [];
            const last = s.months.length ? s.months[s.months.length - 1].month : this.today.slice(0, 8) + '01';
            if (s.status === 'Active') for (let i = 1; i <= 3; i++) ahead.push(addMonths(last, i));
            const row: PreSchoolPendingRow = {
              studentId: s.id, admissionCode: s.admissionCode, childName: s.childName, className: s.className,
              parentName: s.parentName, phone: s.phone, months: [...unpaid, ...ahead], monthlyFee: s.monthlyFee,
              admissionDue: s.admissionPaid ? 0 : s.admissionFee, amount: 0,
              instalmentDue: s.receipts.reduce((t, r) => t + (r.isCancelled ? 0 : r.balance ?? 0), 0)
            };
            const line: Line = { row, picked: new Set(unpaid), mode: this.defaultMode, reference: '', busy: false, receipt: null, mail: null, found: true,
              amounts: Object.fromEntries(row.months.map(m => [m, s.monthlyFee])), receivedOn: this.receivedOn };
            this.lines.set([line, ...this.lines().filter(l => l.row.studentId !== s.id)]);
            this.regNo = '';
            if (!s.monthlyFee) this.messages.add({ severity: 'warn', summary: s.childName, detail: `${s.className} has no monthly fee set.`, life: 4500 });
            else if (!unpaid.length) this.messages.add({ severity: 'info', summary: s.childName, detail: 'All months are paid so far; tick a month ahead to pay in advance.', life: 4500 });
          },
          error: () => this.finding.set(false)
        });
      },
      error: () => this.finding.set(false)
    });
  }

  /** Deletes a receipt just made by mistake: its months are due again and the PreSchool admin is told. */
  undo(l: Line): void {
    const r = l.receipt;
    if (!r || !confirm(`Delete receipt ${r.receiptCode} (${this.money(r.total)}) for ${l.row.childName}? Use this only for a receipt made by mistake. The PreSchool admin will be told.`)) return;
    l.busy = true;
    this.students.deleteReceipt(r.id).subscribe({
      next: () => {
        l.busy = false;
        l.receipt = null;
        l.mail = null;
        this.ticks.update(n => n + 1);
        this.messages.add({ severity: 'success', summary: `${r.receiptCode} deleted`, detail: l.row.childName, life: 3000 });
      },
      error: () => { l.busy = false; this.ticks.update(n => n + 1); }
    });
  }

  load(): void {
    this.loaded.set(false);
    this.students.pending(this.classId, 1).subscribe(report => {
      this.lines.set(report.rows
        .filter(r => r.months.length > 0)
        .map(row => ({ row, picked: new Set(row.months), mode: this.defaultMode, reference: '', busy: false, receipt: null, mail: null,
          amounts: Object.fromEntries(row.months.map(m => [m, row.monthlyFee])), receivedOn: this.receivedOn })));
      this.loaded.set(true);
    });
  }

  /** The date for everyone: every line not yet collected takes it. */
  setAllDates(date: string): void {
    this.receivedOn = date;
    for (const l of this.lines()) if (!l.receipt) l.receivedOn = date;
    this.ticks.update(n => n + 1);
  }

  setAllModes(mode: PreSchoolPayMode): void {
    this.defaultMode = mode;
    for (const l of this.lines()) if (!l.receipt) l.mode = mode;
    this.ticks.update(n => n + 1);
  }

  /** What is taken for the ticked months: each month's amount (the fee unless lowered). */
  lineTotal(l: Line): number {
    return [...l.picked].reduce((t, m) => t + (l.amounts[m] ?? l.row.monthlyFee), 0);
  }

  setAmount(l: Line, month: string, value: number | string | null): void {
    const n = value === null || value === '' ? null : Math.max(0, Number(value));
    l.amounts[month] = n === null || Number.isNaN(n) ? null : n;
    this.ticks.update(x => x + 1);
  }

  toggle(l: Line, month: string): void {
    if (l.picked.has(month)) l.picked.delete(month); else l.picked.add(month);
    this.ticks.update(n => n + 1);
  }

  collect(l: Line): void {
    if (!l.picked.size) return;
    const over = [...l.picked].find(m => (l.amounts[m] ?? l.row.monthlyFee) > l.row.monthlyFee);
    if (over) {
      this.messages.add({ severity: 'warn', summary: 'Please check', detail: `${monthLabel(over)}: more than the month's fee of ${this.money(l.row.monthlyFee)}.`, life: 4500 });
      return;
    }
    if (l.mode === 'UPI' && !l.reference.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Please check', detail: `Enter the UPI reference for ${l.row.childName}.`, life: 4500 });
      return;
    }
    l.busy = true;
    this.students.collect(l.row.studentId, {
      includeAdmission: false, admissionAmount: null, months: [...l.picked].sort(), charges: [],
      monthAmounts: [...l.picked].filter(m => (l.amounts[m] ?? l.row.monthlyFee) < l.row.monthlyFee)
        .map(m => ({ month: m, amount: l.amounts[m] ?? 0 })),
      mode: l.mode, reference: l.mode === 'Cash' ? null : l.reference.trim() || null,
      chequeDate: null, drawnOn: null, receivedOn: l.receivedOn || this.receivedOn || null, notes: null
    }).subscribe({
      next: receipt => {
        l.busy = false;
        l.receipt = receipt;
        l.mail = 'Emailing the receipt…';
        this.ticks.update(n => n + 1);
        void emailReceiptToGuardian(this.students, receipt).then(m => { l.mail = m.message; this.ticks.update(n => n + 1); });
        this.messages.add({ severity: 'success', summary: `Received ${this.money(receipt.total)} · ${receipt.receiptCode}`, detail: l.row.childName, life: 3000 });
      },
      error: () => { l.busy = false; this.ticks.update(n => n + 1); }
    });
  }

  /** Both copies on one A4 sheet; in the app, as a PDF. */
  print(r: PreSchoolReceipt): void {
    if (isNativeApp()) {
      void downloadSizedPdf(feeReceiptHtml(r, 'pair'), pdfFileName('FeeReceipt', r.receiptCode, 'both-copies'),
        { width: 1123, format: 'a4', landscape: true }).catch(() => undefined);
      return;
    }
    const win = openPendingDocumentWindow(1180, 900);
    if (!writeDocumentWindow(win, feeReceiptHtml(r, 'pair'))) {
      this.messages.add({ severity: 'warn', summary: 'Pop-up blocked', detail: 'Allow pop-ups for this site, or use PDF.', life: 5000 });
    }
  }

  /** The parent copy alone, half-A4, as a PDF. */
  pdf(r: PreSchoolReceipt): void {
    void downloadSizedPdf(feeReceiptHtml(r, 'parent'), pdfFileName('FeeReceipt', r.receiptCode, r.childName), { width: 559, format: 'a5' })
      .catch(() => this.messages.add({ severity: 'warn', summary: 'The PDF could not be made', detail: 'Please try again.', life: 4500 }));
  }

  share(row: PreSchoolPendingRow, r: PreSchoolReceipt): string {
    const months = [...new Set(r.lines.filter(x => x.forMonth).map(x => monthLabel(x.forMonth!)))].join(', ');
    return whatsAppLink(row.phone,
      `Avijan PreSchool: received ${this.money(r.total)} for ${row.childName} (${months}). Receipt ${r.receiptCode}. Thank you.`);
  }
}
