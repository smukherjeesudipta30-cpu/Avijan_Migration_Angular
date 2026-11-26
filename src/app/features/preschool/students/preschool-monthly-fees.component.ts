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
      <p class="app-muted">Every child with months unpaid. Tick the months being paid, choose Cash, Bank or UPI, and collect — the receipt opens to print or send.</p>
    </div>

    <div class="app-card pmf-bar">
      <label>Class
        <select [(ngModel)]="classId" (ngModelChange)="load()">
          <option [ngValue]="null">All classes</option>
          @for (c of classes(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
        </select></label>
      <label>Search <input pInputText [ngModel]="searchText()" (ngModelChange)="searchText.set($event)" placeholder="Child, parent or phone" /></label>
      <label>Date received <input pInputText type="date" [(ngModel)]="receivedOn" [max]="today" /></label>
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
        <div class="app-card pmf-line" [class.pmf-line--done]="l.receipt">
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
              </span>
            </div>
          } @else {
            <div class="pmf-months" role="group" [attr.aria-label]="'Months for ' + l.row.childName">
              @for (m of l.row.months; track m) {
                <label class="pmf-month" [class.on]="l.picked.has(m)">
                  <input type="checkbox" [checked]="l.picked.has(m)" (change)="toggle(l, m)" />{{ label(m) }}</label>
              }
            </div>
            <div class="pmf-pay">
              <select [(ngModel)]="l.mode" [attr.aria-label]="'Mode for ' + l.row.childName">
                @for (m of modes; track m) { <option [value]="m">{{ m }}</option> }
              </select>
              @if (l.mode !== 'Cash') {
                <input pInputText [(ngModel)]="l.reference" maxlength="60"
                  [placeholder]="l.mode === 'Bank' ? 'Bank ref / UTR (optional)' : 'UPI reference'" [attr.aria-label]="'Reference for ' + l.row.childName" />
              }
              <strong class="pmf-amt">{{ money(l.picked.size * l.row.monthlyFee) }}</strong>
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
    .pmf-pay { display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
    .pmf-pay input { width: 11rem; }
    .pmf-amt { min-width: 5rem; text-align: right; }
    .pmf-done { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; color: #2b7a2b; font-weight: 600; }
    .pmf-done-actions { display: flex; align-items: center; gap: 0.2rem; }
    .pmf-wa { display: inline-flex; gap: 0.3rem; align-items: center; color: #1f9d55; text-decoration: none; font-weight: 700; font-size: 0.85rem; padding: 0 0.5rem; }
    .pmf-empty { padding: 1rem; }
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
    return this.lines().filter(l => !l.receipt).reduce((t, l) => t + l.picked.size * l.row.monthlyFee, 0);
  });
  readonly collected = computed(() => {
    this.ticks();
    return this.lines().reduce((t, l) => t + (l.receipt?.total ?? 0), 0);
  });

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes));
    this.load();
  }

  load(): void {
    this.loaded.set(false);
    this.students.pending(this.classId, 1).subscribe(report => {
      this.lines.set(report.rows
        .filter(r => r.months.length > 0)
        .map(row => ({ row, picked: new Set(row.months), mode: this.defaultMode, reference: '', busy: false, receipt: null, mail: null })));
      this.loaded.set(true);
    });
  }

  setAllModes(mode: PreSchoolPayMode): void {
    this.defaultMode = mode;
    for (const l of this.lines()) if (!l.receipt) l.mode = mode;
    this.ticks.update(n => n + 1);
  }

  toggle(l: Line, month: string): void {
    if (l.picked.has(month)) l.picked.delete(month); else l.picked.add(month);
    this.ticks.update(n => n + 1);
  }

  collect(l: Line): void {
    if (!l.picked.size) return;
    if (l.mode === 'UPI' && !l.reference.trim()) {
      this.messages.add({ severity: 'warn', summary: 'Please check', detail: `Enter the UPI reference for ${l.row.childName}.`, life: 4500 });
      return;
    }
    l.busy = true;
    this.students.collect(l.row.studentId, {
      includeAdmission: false, admissionAmount: null, months: [...l.picked].sort(), charges: [],
      mode: l.mode, reference: l.mode === 'Cash' ? null : l.reference.trim() || null,
      chequeDate: null, drawnOn: null, receivedOn: this.receivedOn || null, notes: null
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
