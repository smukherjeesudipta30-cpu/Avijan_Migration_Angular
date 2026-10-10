import { downloadBlob } from '../../core/printing/download-file';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { forkJoin, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { downloadDocumentPdf, downloadPagesPdf } from '../../core/printing/pdf-download';

type StockSection = 'raw' | 'semi' | 'finished';

interface StockLine {
  section: StockSection;
  description: string;
  place: string;
  quantity: number | null;
  rate: number | null;
  remarks: string;
}

/** What is stored per month. Book debts are not stored: they are worked out from the fee ledger. */
interface StatementData {
  branchName: string;
  borrowerName: string;
  stock: StockLine[];
  creditors: number | null;
  sales: number | null;
  purchases: number | null;
  purchasesDaLc: number | null;
  draweeBills: number | null;
}

interface StatementDto {
  month: string;
  saved: boolean;
  carriedFrom: string | null;
  data: string;
  modifiedBy: string | null;
  modifiedOn: string | null;
}

interface BookDebtRow {
  drawee: string;
  students: number;
  opening: number;
  raised: number;
  received: number;
  returned: number;
  net: number;
  upto90: number;
  days90To120: number;
  days120To180: number;
  above180: number;
}

const SECTIONS: { key: StockSection; label: string }[] = [
  { key: 'raw', label: 'RAW MATERIAL' },
  { key: 'semi', label: 'SEMI FINISHED GOODS' },
  { key: 'finished', label: 'FINISHED GOODS' }
];

/**
 * Bank of Maharashtra monthly statements (Appendix 6): stock and book debts.
 * Admin keeps the stock list here; a new month opens with the last saved
 * month's list, so only what changed needs editing. Book debts are not typed
 * in at all — they are the students' unpaid fees per branch, worked out from
 * the fee ledger. Both download in the bank's own layout, as PDF or Excel.
 */
@Component({
  selector: 'app-bank-statement',
  imports: [CommonModule, FormsModule, ButtonModule, DatePickerModule, InputTextModule],
  template: `
    <div class="app-page-head bs__head">
      <div>
        <span class="app-eyebrow">Bank</span>
        <h1>Bank statement</h1>
        <p class="app-muted">Monthly stock and book-debt statements for Bank of Maharashtra, in the bank's format.</p>
      </div>
      <label class="bs__month">
        <span class="app-muted">Month</span>
        <p-datepicker [ngModel]="monthDate()" (ngModelChange)="selectMonth($event)" view="month"
                      dateFormat="MM yy" [readonlyInput]="true" appendTo="body" />
      </label>
    </div>

    @if (loading()) {
      <p class="app-muted">Loading…</p>
    } @else {
      @if (carriedFrom(); as from) {
        <p class="bs__note"><i class="pi pi-info-circle"></i>
          Not saved yet for {{ monthLabel() }} — showing the stock from {{ from }}. Update anything that changed and save.</p>
      } @else if (!saved() && data().stock.length === 0) {
        <p class="bs__note"><i class="pi pi-info-circle"></i>
          No stock entered yet. Add each item once; later months start from this list.</p>
      }

      <section class="app-card bs__card">
        <div class="bs__grid2">
          <label>Bank branch<input pInputText [(ngModel)]="data().branchName" placeholder="Sonarpur" /></label>
          <label>Name of the borrower<input pInputText [(ngModel)]="data().borrowerName" placeholder="AVIJAN" /></label>
        </div>
      </section>

      <section class="app-card bs__card">
        <h2>Stock statement</h2>
        @for (sec of sections; track sec.key) {
          <h3>{{ sec.label }}</h3>
          <div class="bs__table-wrap">
            <table class="bs__table">
              <thead><tr><th>Description of the goods</th><th>Place of storage</th><th>Quantity</th><th>Rate (₹)</th><th>Value (₹)</th><th>Remarks</th><th></th></tr></thead>
              <tbody>
                @for (line of linesOf(sec.key); track $index) {
                  <tr>
                    <td><input pInputText [(ngModel)]="line.description" (ngModelChange)="touch()" /></td>
                    <td><input pInputText [(ngModel)]="line.place" (ngModelChange)="touch()" /></td>
                    <td><input pInputText type="number" min="0" [(ngModel)]="line.quantity" (ngModelChange)="touch()" class="bs__num" /></td>
                    <td><input pInputText type="number" min="0" [(ngModel)]="line.rate" (ngModelChange)="touch()" class="bs__num" /></td>
                    <td class="bs__val">{{ amt(value(line)) }}</td>
                    <td><input pInputText [(ngModel)]="line.remarks" (ngModelChange)="touch()" /></td>
                    <td><p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removeLine(line)" ariaLabel="Remove" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p-button label="Add item" icon="pi pi-plus" [text]="true" (onClick)="addLine(sec.key)" />
        }
        <p class="bs__total">Total stock value: <strong>₹{{ amt(stockTotal()) }}</strong></p>

        <div class="bs__grid2">
          <label>Creditors for goods (₹)<input pInputText type="number" [(ngModel)]="data().creditors" (ngModelChange)="touch()" /></label>
          <label>Sales during the month (₹)<input pInputText type="number" [(ngModel)]="data().sales" (ngModelChange)="touch()" /></label>
          <label>Purchases during the month (₹)<input pInputText type="number" [(ngModel)]="data().purchases" (ngModelChange)="touch()" /></label>
          <label>Purchases under D/A, L/C (₹)<input pInputText type="number" [(ngModel)]="data().purchasesDaLc" (ngModelChange)="touch()" /></label>
          <label>Drawee bills (₹)<input pInputText type="number" [(ngModel)]="data().draweeBills" (ngModelChange)="touch()" /></label>
        </div>
      </section>

      <section class="app-card bs__card">
        <h2>Book debt statement</h2>
        <p class="app-muted">Filled automatically from Avijan: students' unpaid monthly fees per branch as on {{ monthEndLabel() }}.
          Aged from each student's last payment. Nothing to type here.</p>
        <div class="bs__table-wrap">
          <table class="bs__table bs__table--ro">
            <thead><tr><th>Drawee</th><th>Opening</th><th>Raised</th><th>Received</th><th>Net</th><th>≤90 days</th><th>90–120</th><th>120–180</th><th>&gt;180</th></tr></thead>
            <tbody>
              @for (r of debts(); track r.drawee) {
                <tr><td>{{ r.drawee }} ({{ r.students }})</td><td>{{ amt(r.opening) }}</td><td>{{ amt(r.raised) }}</td>
                  <td>{{ amt(r.received) }}</td><td><strong>{{ amt(r.net) }}</strong></td><td>{{ amt(r.upto90) }}</td>
                  <td>{{ amt(r.days90To120) }}</td><td>{{ amt(r.days120To180) }}</td><td>{{ amt(r.above180) }}</td></tr>
              } @empty {
                <tr><td colspan="9" class="app-muted">No unpaid fees for this month.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <div class="bs__actions">
        <p-button label="Save" icon="pi pi-save" [loading]="saving()" (onClick)="save()" />
        <p-button label="Download PDF (both pages)" icon="pi pi-file-pdf" severity="secondary" (onClick)="downloadBothPdf()" />
        <p-button label="Stock PDF" icon="pi pi-file-pdf" severity="secondary" [outlined]="true" (onClick)="downloadStockPdf()" />
        <p-button label="Book debt PDF" icon="pi pi-file-pdf" severity="secondary" [outlined]="true" (onClick)="downloadDebtPdf()" />
        <p-button label="Excel (both)" icon="pi pi-file-excel" severity="secondary" [outlined]="true" (onClick)="downloadExcel()" />
      </div>
    }
  `,
  styles: [`
    .bs__head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-end; }
    .bs__month { display: flex; flex-direction: column; gap: .25rem; }
    .bs__note { display: flex; gap: .5rem; align-items: center; padding: .6rem .8rem; border-radius: 8px;
                background: color-mix(in srgb, var(--p-primary-color) 10%, transparent); }
    .bs__card { margin-bottom: 1rem; }
    .bs__card h2 { margin: 0 0 .5rem; font-size: 1.15rem; }
    .bs__card h3 { margin: 1rem 0 .4rem; font-size: .9rem; letter-spacing: .04em; }
    .bs__grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .75rem; margin-top: .75rem; }
    .bs__grid2 label { display: flex; flex-direction: column; gap: .25rem; font-size: .85rem; }
    .bs__table-wrap { overflow-x: auto; }
    .bs__table { width: 100%; border-collapse: collapse; min-width: 720px; }
    .bs__table th, .bs__table td { padding: .3rem; border-bottom: 1px solid var(--p-content-border-color); text-align: left; font-size: .85rem; }
    .bs__table input { width: 100%; }
    .bs__num { max-width: 110px; }
    .bs__val { text-align: right; white-space: nowrap; }
    .bs__table--ro td:not(:first-child), .bs__table--ro th:not(:first-child) { text-align: right; }
    .bs__total { text-align: right; margin: .75rem 0 0; }
    .bs__actions { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 2rem; }
  `]
})
export class BankStatementComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly base = `${environment.apiBaseUrl}/bank-statements`;

  readonly sections = SECTIONS;
  readonly monthDate = signal(this.defaultMonth());
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly carriedFrom = signal<string | null>(null);
  readonly data = signal<StatementData>(this.blank());
  readonly debts = signal<BookDebtRow[]>([]);
  /** Bumped on every edit so the computed totals re-read the (mutated) lines. */
  private readonly version = signal(0);

  readonly monthLabel = computed(() => this.monthDate().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
  readonly monthEndLabel = computed(() => this.fmtDate(this.monthEnd()));
  readonly stockTotal = computed(() => {
    this.version();
    return this.data().stock.reduce((sum, l) => sum + this.value(l), 0);
  });

  ngOnInit(): void {
    this.load();
  }

  /** Last month by default: the statement goes to the bank after the month has closed. */
  private defaultMonth(): Date {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }

  private blank(): StatementData {
    return { branchName: 'Sonarpur', borrowerName: 'AVIJAN', stock: [], creditors: null, sales: null,
             purchases: null, purchasesDaLc: null, draweeBills: null };
  }

  private monthEnd(): Date {
    const m = this.monthDate();
    return new Date(m.getFullYear(), m.getMonth() + 1, 0);
  }

  selectMonth(d: Date | null): void {
    if (!d) return;
    this.monthDate.set(new Date(d.getFullYear(), d.getMonth(), 1));
    this.load();
  }

  private path(): string {
    const m = this.monthDate();
    return `${this.base}/${m.getFullYear()}/${m.getMonth() + 1}`;
  }

  private load(): void {
    this.loading.set(true);
    const requested = this.path();
    forkJoin({
      statement: this.http.get<ApiResponse<StatementDto>>(requested).pipe(map(r => r.data)),
      debts: this.http.get<ApiResponse<BookDebtRow[]>>(`${requested}/book-debts`).pipe(map(r => r.data))
    }).subscribe({
      next: ({ statement, debts }) => {
        if (requested !== this.path()) return;   // another month was picked meanwhile
        let parsed: Partial<StatementData> = {};
        try { parsed = JSON.parse(statement.data || '{}'); } catch { /* treat as empty */ }
        this.data.set({ ...this.blank(), ...parsed, stock: (parsed.stock ?? []).map(l => ({ ...l })) });
        // The bank knows the borrower as AVIJAN; earlier drafts used the long name.
        if (this.data().borrowerName === 'Avijan Computer Center') this.data().borrowerName = 'AVIJAN';
        if (!this.data().branchName?.trim()) this.data().branchName = 'Sonarpur';
        this.saved.set(statement.saved);
        this.carriedFrom.set(statement.carriedFrom ? this.monthName(statement.carriedFrom) : null);
        this.debts.set(debts);
        this.touch();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  linesOf(section: StockSection): StockLine[] {
    this.version();
    return this.data().stock.filter(l => l.section === section);
  }

  value(l: StockLine): number {
    return Math.round((Number(l.quantity) || 0) * (Number(l.rate) || 0) * 100) / 100;
  }

  touch(): void {
    this.version.update(v => v + 1);
  }

  addLine(section: StockSection): void {
    const place = this.data().stock.find(l => l.place)?.place ?? '';
    this.data().stock.push({ section, description: '', place, quantity: null, rate: null, remarks: '' });
    this.touch();
  }

  removeLine(line: StockLine): void {
    const stock = this.data().stock;
    stock.splice(stock.indexOf(line), 1);
    this.touch();
  }

  save(): void {
    const d = this.data();
    const clean: StatementData = { ...d, stock: d.stock.filter(l => l.description.trim()) };
    this.saving.set(true);
    this.http.put<ApiResponse<StatementDto>>(this.path(), { data: JSON.stringify(clean) }).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.carriedFrom.set(null);
        this.data.set(clean);
        this.touch();
        this.messages.add({ severity: 'success', summary: `Statement saved for ${this.monthLabel()}`, life: 3000 });
      },
      error: () => this.saving.set(false)
    });
  }

  /* ------------------------------------------------------------ documents */

  private esc(s: unknown): string {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  }

  amt(n: number | null | undefined): string {
    return n == null || (n as unknown) === '' ? '' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private fmtDate(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  private monthName(key: string): string {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  private fileStem(): string {
    const m = this.monthDate();
    return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  }

  private stockTableHtml(): string {
    const d = this.data();
    let sr = 0;
    const body = SECTIONS.map(sec => {
      const lines = d.stock.filter(l => l.section === sec.key && l.description.trim());
      const rows = lines.map(l => `<tr><td class="c">${++sr}</td><td>${this.esc(l.description)}</td><td>${this.esc(l.place)}</td>
        <td class="r">${this.esc(l.quantity ?? '')}</td><td class="r">${this.amt(l.rate)}</td><td class="r">${this.amt(this.value(l))}</td><td>${this.esc(l.remarks)}</td></tr>`).join('');
      const pad = '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(Math.max(0, 2 - lines.length));
      return `<tr><td></td><td><b>${sec.label}</b></td><td></td><td></td><td></td><td></td><td></td></tr>${rows}${pad}`;
    }).join('');
    return `<table class="grid"><thead><tr><th style="width:6%">Sr. No.</th><th style="width:26%">Description of the goods</th><th>Place of storage</th>
      <th>Quantity</th><th>Rate of valuation</th><th>Value</th><th>Remarks</th></tr></thead><tbody>${body}
      <tr><td></td><td><b>TOTAL</b></td><td></td><td></td><td></td><td class="r"><b>${this.amt(this.stockTotal())}</b></td><td></td></tr></tbody></table>`;
  }

  private stockHtml(): string {
    const d = this.data();
    const end = this.monthEndLabel();
    return this.page(`
      <p><b>Appendix 6</b></p><p><b>FORMAT OF MONTHLY STOCK STATEMENT</b></p>
      <p class="c">BANK OF MAHARASHTRA, <u>&nbsp;${this.esc(d.branchName) || '&nbsp;'.repeat(30)}&nbsp;</u> BRANCH</p>
      <p class="c">Statement of stock hypothecated to bank as of <u>&nbsp;${end}&nbsp;</u></p>
      ${this.stockTableHtml()}
      <table class="plain">
        <tr><td>CREDITORS FOR GOODS AS ON ${end}</td><td class="r">Rs. ${this.amt(d.creditors)}</td></tr>
        <tr><td>SALES DURING THE MONTH</td><td class="r">Rs. ${this.amt(d.sales)}</td></tr>
        <tr><td>PURCHASES DURING THE MONTH</td><td class="r">Rs. ${this.amt(d.purchases)}</td></tr>
        <tr><td>PURCHASES UNDER D/A, L/C</td><td class="r">Rs. ${this.amt(d.purchasesDaLc)}</td></tr>
        <tr><td>DRAWEE BILLS</td><td class="r">Rs. ${this.amt(d.draweeBills)}</td></tr>
      </table>
      <p class="j">I / We solemnly declare that the quality, quantity and rates of the items noted over leaf hypothecated to the Bank are correct
      and the said stock is either absolutely my / our own property or that I / We have such an interest in the same as to hypothecate these
      to the Bank to the full extent of the Bank's advance/s to me / us against these goods and that they are not subject to any lien, claim
      or charge of any sort and on the strength of this declaration of mine / ours the accommodation has been granted. In order to verify our
      above statement the bank is at liberty to get the goods weighed and valued at any time at our expenses.</p>
      <div class="sig"><div class="sig__for">For ${this.esc(d.borrowerName)}</div><div class="sig__box"></div><div class="sig__line">Authorised Signatory<br>(Signature &amp; Stamp)</div><div class="sig__date">Date: ________________</div></div>`, 794);
  }

  private debtTableHtml(): string {
    const rows = this.debts();
    const sum = (k: keyof BookDebtRow) => rows.reduce((s, r) => s + (r[k] as number), 0);
    const tr = rows.map(r => `<tr><td>${this.esc(r.drawee)} (${r.students} students)</td><td class="c">No</td><td class="r">${this.amt(r.opening)}</td>
      <td class="r">${this.amt(r.raised)}</td><td class="r">${this.amt(r.received)}</td><td class="r">${this.amt(r.returned)}</td><td class="r">${this.amt(r.net)}</td>
      <td class="r">${this.amt(r.upto90)}</td><td class="r">${this.amt(r.days90To120)}</td><td class="r">${this.amt(r.days120To180)}</td><td class="r">${this.amt(r.above180)}</td>
      <td>Student fees</td></tr>`).join('');
    return `<table class="grid"><thead>
      <tr><th rowspan="2">Name of the drawee</th><th rowspan="2">Whether Sister/ Associate concern</th><th rowspan="2">Outstanding as per last statement</th>
        <th rowspan="2">Bills raised during the month</th><th rowspan="2">Payment received during month</th><th rowspan="2">Return/ rejection/ during month</th>
        <th rowspan="2">Net balance (3+4) - (5) - (6)</th><th colspan="4">OF WHICH OUTSTANDING FOR</th><th rowspan="2">REMARKS</th></tr>
      <tr><th>Upto 90 days</th><th>Between 90 to 120 days</th><th>Between 120 to 180 days</th><th>Above 180 days</th></tr>
      <tr>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `<th>${n}</th>`).join('')}</tr></thead>
      <tbody>${tr}<tr><td><b>TOTAL</b></td><td></td><td class="r"><b>${this.amt(sum('opening'))}</b></td><td class="r"><b>${this.amt(sum('raised'))}</b></td>
        <td class="r"><b>${this.amt(sum('received'))}</b></td><td class="r"><b>${this.amt(sum('returned'))}</b></td><td class="r"><b>${this.amt(sum('net'))}</b></td>
        <td class="r"><b>${this.amt(sum('upto90'))}</b></td><td class="r"><b>${this.amt(sum('days90To120'))}</b></td><td class="r"><b>${this.amt(sum('days120To180'))}</b></td>
        <td class="r"><b>${this.amt(sum('above180'))}</b></td><td></td></tr></tbody></table>`;
  }

  private debtHtml(): string {
    const d = this.data();
    const total = this.debts().reduce((s, r) => s + r.net, 0);
    return this.page(`
      <p><b>Appendix 6</b></p><p><b>FORMAT FOR <u>MONTHLY</u> BOOK DEBT STATEMENT</b></p>
      <p class="c">BANK OF MAHARASHTRA, <u>&nbsp;${this.esc(d.branchName) || '&nbsp;'.repeat(30)}&nbsp;</u> BRANCH<br>
        NAME OF THE BORROWER : <u>&nbsp;${this.esc(d.borrowerName)}&nbsp;</u></p>
      <p class="c">Statement of Bills Receivables / Book debts as on <u>&nbsp;${this.monthEndLabel()}&nbsp;</u><br>
        (Applicable to the accounts having W.C. limits of Rs.10.00 lakhs and above)</p>
      ${this.debtTableHtml()}
      <p>Bills of Small amounts upto Rs.25,000/- may be clubbed<br>
        Total book debts outstanding as on the date Rs. <u>&nbsp;${this.amt(total)}&nbsp;</u><br>
        Bills raised on sister / associate concerns for genuine trade transactions - Rs. <u>&nbsp;Nil&nbsp;</u></p>
      <div class="sig"><div class="sig__for">For ${this.esc(d.borrowerName)}</div><div class="sig__box"></div><div class="sig__line">Authorised Signatory<br>(Signature &amp; Stamp)</div><div class="sig__date">Date: ________________</div></div>`, 1123);
  }

  private page(inner: string, width: number): string {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 0; padding: 36px 44px; width: ${width - 88}px; }
      p { margin: 6px 0; } .c { text-align: center; } .r { text-align: right; } .j { text-align: justify; }
      table.grid { width: 100%; border-collapse: collapse; margin: 10px 0; }
      table.grid th, table.grid td { border: 1px solid #000; padding: 4px 5px; vertical-align: top; }
      table.grid th { font-weight: normal; text-align: left; }
      table.plain { width: 70%; margin: 10px 0; } table.plain td { padding: 3px 0; }
      .sig { width: 260px; margin: 22px 0 0 auto; text-align: center; }
      .sig__for { font-weight: bold; }
      .sig__box { height: 90px; }
      .sig__line { border-top: 1px solid #000; padding-top: 4px; }
      .sig__date { margin-top: 10px; text-align: left; }
    </style></head><body>${inner}</body></html>`;
  }

  /** Both statements in one file: stock (portrait) then book debts (landscape). */
  async downloadBothPdf(): Promise<void> {
    await downloadPagesPdf([
      { html: this.stockHtml(), width: 794 },
      { html: this.debtHtml(), width: 1123, landscape: true }
    ], `Bank-statement-${this.fileStem()}.pdf`);
  }

  async downloadStockPdf(): Promise<void> {
    await downloadDocumentPdf(this.stockHtml(), `Stock-statement-${this.fileStem()}.pdf`, { width: 794 });
  }

  async downloadDebtPdf(): Promise<void> {
    await downloadDocumentPdf(this.debtHtml(), `Book-debt-statement-${this.fileStem()}.pdf`, { width: 1123, landscape: true });
  }

  /** An HTML workbook Excel opens directly, one block per statement. */
  downloadExcel(): void {
    const strip = (html: string) => html.replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head><meta charset="utf-8"><style>td,th{border:1px solid #000;} .r{text-align:right}</style></head>
      <body>${strip(this.stockHtml())}<br><br>${strip(this.debtHtml())}</body></html>`;
    void downloadBlob(new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' }), `Bank-statement-${this.fileStem()}.xls`);
  }
}
