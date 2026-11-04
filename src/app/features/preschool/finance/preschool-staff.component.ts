import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { formatMoney } from '../../../core/format/money';
import { todayIso } from '../../../core/models/preschool.model';
import {
  PreSchoolOutMode, PreSchoolSalaryPayment, PreSchoolSalaryRow, PreSchoolSalarySheet, PreSchoolStaff, PreSchoolStaffRole,
  PreSchoolStaffSave
} from '../../../core/models/preschool-finance.model';
import { monthLabel } from '../../../core/models/preschool-student.model';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { preSchoolPayslipHtml } from '../../../core/printing/preschool-payslip';
import { PreSchoolFinanceService } from '../../../core/services/preschool-finance.service';

/** What is typed into one unpaid row of the salary sheet. */
interface PayDraft { daysAbsent: number; deduction: number; mode: PreSchoolOutMode; reference: string; }

const blankStaff = (): PreSchoolStaffSave => ({
  name: '', role: 'Teacher', phone: null, email: null, joinedOn: todayIso(), leftOn: null, monthlySalary: 0, notes: null
});

function shiftMonth(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-01`;
}

/**
 * PreSchool staff on fixed monthly salaries — receptionist, teachers and the
 * housekeeper — and the month's salary sheet. No percentage, commission or
 * bonus. Days absent are entered by the admin (the housekeeper's are kept on
 * paper), and the admin decides any deduction. PreSchool admin only.
 */
@Component({
  selector: 'app-preschool-staff',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool · Accounts</span>
      <h1>Staff &amp; salary</h1>
      <p class="app-muted">Fixed monthly salary for the receptionist, teachers and housekeeper. Pay each month here and print the salary slip.</p>
    </div>

    <section class="app-card pst-card">
      <div class="pst-month">
        <p-button icon="pi pi-chevron-left" [text]="true" [rounded]="true" ariaLabel="Previous month" (onClick)="setMonth(shift(month(), -1))" />
        <h2>Salary for {{ label(month()) }}</h2>
        <p-button icon="pi pi-chevron-right" [text]="true" [rounded]="true" ariaLabel="Next month" [disabled]="month() >= thisMonth" (onClick)="setMonth(shift(month(), 1))" />
        @if (sheet(); as s) {
          <span class="pst-sum">Paid <strong>{{ money(s.totalPaid) }}</strong> · still to pay <strong class="pst-red">{{ money(s.totalUnpaid) }}</strong></span>
        }
      </div>

      <div class="pst-sheet">
        <div class="pst-row pst-row--head"><span>Name</span><span class="r">Salary</span><span>Days absent</span><span>Deduction ₹</span><span>Mode</span><span class="r">Net</span><span></span></div>
        @for (r of sheet()?.rows ?? []; track r.staffId) {
          @if (r.payment; as p) {
            <div class="pst-row pst-row--paid">
              <span><strong>{{ r.name }}</strong><small>{{ r.role }}</small></span>
              <span class="r">{{ money(p.salary) }}</span>
              <span>{{ p.daysAbsent }}</span>
              <span>{{ p.deduction ? money(p.deduction) : '—' }}</span>
              <span>{{ p.mode }}</span>
              <span class="r"><strong>{{ money(p.netPaid) }}</strong><small>paid {{ p.paidOn | date: 'd MMM' }}</small></span>
              <span class="pst-actions">
                <p-button icon="pi pi-print" [text]="true" [rounded]="true" ariaLabel="Print salary slip" (onClick)="slip(p)" />
                <p-button icon="pi pi-undo" [text]="true" [rounded]="true" severity="danger" ariaLabel="Remove payment" (onClick)="unpay(p)" />
              </span>
            </div>
          } @else {
            <div class="pst-row">
              <span><strong>{{ r.name }}</strong><small>{{ r.role }}</small></span>
              <span class="r">{{ money(r.monthlySalary) }}</span>
              <span><input pInputText type="number" min="0" max="31" step="0.5" [(ngModel)]="draft(r).daysAbsent" aria-label="Days absent" /></span>
              <span><input pInputText type="number" min="0" [(ngModel)]="draft(r).deduction" aria-label="Deduction" /></span>
              <span>
                <select [(ngModel)]="draft(r).mode" aria-label="Payment mode"><option>Cash</option><option>Bank</option><option>UPI</option></select>
                @if (draft(r).mode !== 'Cash') { <input pInputText [(ngModel)]="draft(r).reference" placeholder="Ref." maxlength="60" aria-label="Reference" /> }
              </span>
              <span class="r"><strong>{{ money(r.monthlySalary - (+draft(r).deduction || 0)) }}</strong></span>
              <span class="pst-actions"><p-button label="Pay" size="small" [loading]="paying() === r.staffId" (onClick)="pay(r)" /></span>
            </div>
          }
        } @empty {
          <p class="app-muted">No staff working in {{ label(month()) }}. Add them below.</p>
        }
      </div>
    </section>

    <div class="pst-grid">
      <section class="app-card pst-card">
        <h2>{{ editId() === null ? 'Add staff' : 'Edit staff' }}</h2>
        <div class="pst-form">
          <label class="w2">Name * <input pInputText [(ngModel)]="form.name" maxlength="100" /></label>
          <label>Role *
            <select [(ngModel)]="form.role">
              @for (r of roles; track r) { <option [value]="r">{{ r }}</option> }
            </select></label>
          <label>Monthly salary (₹) * <input pInputText type="number" min="1" [(ngModel)]="form.monthlySalary" /></label>
          <label>Phone <input pInputText type="tel" [(ngModel)]="form.phone" maxlength="15" /></label>
          <label>Email <input pInputText type="email" [(ngModel)]="form.email" maxlength="150" /></label>
          <label>Joined on * <input pInputText type="date" [(ngModel)]="form.joinedOn" /></label>
          <label>Left on <input pInputText type="date" [(ngModel)]="form.leftOn" /></label>
          <label class="w2">Notes <input pInputText [(ngModel)]="form.notes" maxlength="300" /></label>
        </div>
        <div class="pst-buttons">
          <p-button [label]="editId() === null ? 'Add staff' : 'Save'" icon="pi pi-check" [loading]="saving()" (onClick)="saveStaff()" />
          @if (editId() !== null) { <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="resetForm()" /> }
        </div>
      </section>

      <section class="app-card pst-card">
        <h2>Staff list</h2>
        @for (s of staff(); track s.id) {
          <div class="pst-person" [class.pst-person--left]="!s.isWorking">
            <span><strong>{{ s.name }}</strong><small>{{ s.role }} · since {{ s.joinedOn | date: 'MMM y' }}@if (s.leftOn) { · left {{ s.leftOn | date: 'd MMM y' }} }</small></span>
            <strong>{{ money(s.monthlySalary) }}/month</strong>
            <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" ariaLabel="Edit" (onClick)="edit(s)" />
          </div>
        } @empty {
          <p class="app-muted">No staff yet.</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .pst-card { padding: 1rem 1.15rem; margin-bottom: 1rem; }
    .pst-card h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .pst-month { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
    .pst-month h2 { margin: 0; }
    .pst-sum { margin-left: auto; font-size: 0.9rem; }
    .pst-red { color: #b42318; }
    .pst-row { display: grid; grid-template-columns: 1.4fr 0.8fr 0.8fr 0.9fr 1.3fr 0.9fr 5rem; gap: 0.5rem; align-items: center;
      padding: 0.55rem 0; border-bottom: 1px solid var(--app-border); }
    .pst-row span { min-width: 0; }
    .pst-row small { display: block; color: var(--app-text-muted); font-size: 0.76rem; }
    .pst-row input, .pst-row select { width: 100%; min-width: 0; }
    .pst-row select { padding: 0.45rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; margin-bottom: 0.25rem; }
    .pst-row--head span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--app-text-muted); }
    .pst-row--paid { background: #f4fbf4; }
    .pst-actions { display: flex; justify-content: flex-end; }
    .r { text-align: right; }
    .pst-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
    .pst-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin-bottom: 0.9rem; }
    .pst-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .pst-form select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .w2 { grid-column: 1 / -1; }
    .pst-buttons { display: flex; gap: 0.6rem; }
    .pst-person { display: grid; grid-template-columns: 1fr auto auto; gap: 0.6rem; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--app-border); }
    .pst-person small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .pst-person--left { opacity: 0.55; }
    @media (max-width: 1000px) { .pst-grid { grid-template-columns: 1fr; } .pst-row { grid-template-columns: 1fr 1fr; } .pst-row--head { display: none; } }
  `]
})
export class PreSchoolStaffComponent implements OnInit {
  private readonly finance = inject(PreSchoolFinanceService);
  private readonly messages = inject(MessageService);

  readonly roles: PreSchoolStaffRole[] = ['Receptionist', 'Teacher', 'Housekeeper'];
  readonly thisMonth = todayIso().slice(0, 8) + '01';
  readonly money = formatMoney;
  readonly label = monthLabel;
  readonly shift = shiftMonth;

  readonly month = signal(this.thisMonth);
  readonly sheet = signal<PreSchoolSalarySheet | null>(null);
  readonly staff = signal<PreSchoolStaff[]>([]);
  readonly editId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly paying = signal<number | null>(null);

  form: PreSchoolStaffSave = blankStaff();
  private drafts = new Map<number, PayDraft>();

  ngOnInit(): void {
    this.loadSheet();
    this.loadStaff();
  }

  setMonth(m: string): void { this.month.set(m); this.loadSheet(); }

  private loadSheet(): void {
    this.drafts.clear();
    this.finance.salarySheet(this.month()).subscribe(s => this.sheet.set(s));
  }

  private loadStaff(): void {
    this.finance.staff().subscribe(s => this.staff.set(s));
  }

  draft(r: PreSchoolSalaryRow): PayDraft {
    let d = this.drafts.get(r.staffId);
    if (!d) { d = { daysAbsent: 0, deduction: 0, mode: 'Cash', reference: '' }; this.drafts.set(r.staffId, d); }
    return d;
  }

  pay(r: PreSchoolSalaryRow): void {
    const d = this.draft(r);
    const deduction = Number(d.deduction) || 0;
    if (deduction < 0 || deduction > r.monthlySalary) return this.warn('The deduction must be between 0 and the salary.');
    const win = openPendingDocumentWindow(760, 900);
    this.paying.set(r.staffId);
    this.finance.paySalary({
      staffId: r.staffId, forMonth: this.month(), paidOn: null, daysAbsent: Number(d.daysAbsent) || 0, deduction,
      mode: d.mode, reference: d.mode === 'Cash' ? null : d.reference.trim() || null, notes: null
    }).subscribe({
      next: p => {
        this.paying.set(null);
        writeDocumentWindow(win, preSchoolPayslipHtml(p));
        this.done(`${r.name} paid ${this.money(p.netPaid)}`);
        this.loadSheet();
      },
      error: () => { this.paying.set(null); win?.close(); }
    });
  }

  slip(p: PreSchoolSalaryPayment): void {
    const win = openPendingDocumentWindow(760, 900);
    if (!writeDocumentWindow(win, preSchoolPayslipHtml(p))) this.warn('The slip window was blocked. Allow pop-ups for this site.');
  }

  unpay(p: PreSchoolSalaryPayment): void {
    if (!confirm(`Remove ${p.staffName}'s salary payment for ${monthLabel(p.forMonth)}? Use this only if it was entered by mistake.`)) return;
    this.finance.deleteSalaryPayment(p.id).subscribe(() => { this.done('Salary payment removed'); this.loadSheet(); });
  }

  edit(s: PreSchoolStaff): void {
    this.editId.set(s.id);
    this.form = { name: s.name, role: s.role, phone: s.phone ?? null, email: s.email ?? null, joinedOn: s.joinedOn,
      leftOn: s.leftOn ?? null, monthlySalary: s.monthlySalary, notes: s.notes ?? null };
  }

  resetForm(): void { this.editId.set(null); this.form = blankStaff(); }

  saveStaff(): void {
    const f = this.form;
    if (!f.name.trim()) return this.warn('Enter the name.');
    if (!(Number(f.monthlySalary) > 0)) return this.warn('Enter the monthly salary.');
    if (!f.joinedOn) return this.warn('Pick the joining date.');
    const clean = (v: string | null) => (v ?? '').trim() || null;
    this.saving.set(true);
    this.finance.saveStaff(this.editId(), {
      ...f, name: f.name.trim(), phone: clean(f.phone), email: clean(f.email), notes: clean(f.notes),
      leftOn: f.leftOn || null, monthlySalary: Number(f.monthlySalary)
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.done(this.editId() === null ? 'Staff member added' : 'Staff member saved');
        this.resetForm();
        this.loadStaff();
        this.loadSheet();
      },
      error: () => this.saving.set(false)
    });
  }

  private done(summary: string): void { this.messages.add({ severity: 'success', summary, life: 3000 }); }
  private warn(detail: string): void { this.messages.add({ severity: 'warn', summary: 'Please check', detail, life: 4500 }); }
}
