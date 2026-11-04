import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolClass, todayIso } from '../../../core/models/preschool.model';
import {
  PreSchoolMonth, PreSchoolPayMode, PreSchoolReceipt, PreSchoolStudentDetail, PreSchoolStudentSave, monthLabel, whatsAppLink
} from '../../../core/models/preschool-student.model';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { preSchoolReceiptHtml } from '../../../core/printing/preschool-receipt';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolStudentService } from '../../../core/services/preschool-student.service';

const blankForm = (): PreSchoolStudentSave => ({
  childName: '', dateOfBirth: '', gender: null, bloodGroup: null, fatherName: null, motherName: null,
  parentName: '', phone: '', emergencyPhone: null, email: null, address: null, classId: 0,
  joinedOn: todayIso(), monthlyDiscount: 0, status: 'Active', endedOn: null, notes: null
});

/** "2026-11-01" plus n months. */
function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-01`;
}

/**
 * One PreSchool child: the admission form for a new child, and for an admitted
 * one their months, fee collection, receipts and details. Collecting opens the
 * receipt at once, ready to print or save as PDF.
 */
@Component({
  selector: 'app-preschool-student',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule, InputTextModule],
  template: `
    <a routerLink="/preschool/students" class="psd-back"><i class="pi pi-arrow-left" aria-hidden="true"></i> Students</a>

    @if (isNew()) {
      <div class="app-page-head">
        <span class="app-eyebrow">Avijan PreSchool</span>
        <h1>New admission</h1>
        <p class="app-muted">Save the admission first; the admission fee and months are collected on the next screen.</p>
      </div>
    }
    @if (!isNew() && student(); as s) {
      <div class="app-page-head psd-title">
        <div>
          <span class="app-eyebrow">{{ s.admissionCode }} · {{ s.className }}</span>
          <h1>{{ s.childName }}</h1>
          <p class="app-muted">{{ s.parentName }} · <a [href]="'tel:' + s.phone">{{ s.phone }}</a> · joined {{ s.joinedOn | date: 'd MMM y' }}
            @if (s.status !== 'Active') { · <strong>{{ s.status }}</strong> }</p>
        </div>
      </div>
    }

    <div class="psd" [class.psd--new]="isNew()">
      @if (!isNew() && student(); as s) {
        <section class="app-card psd-fees">
          <div class="psd-fee-head">
            <h2>Collect fees</h2>
            <span>Monthly fee <strong>{{ money(s.monthlyFee) }}</strong>@if (s.monthlyDiscount > 0) { <small>(after {{ money(s.monthlyDiscount) }} discount)</small> }</span>
          </div>

          @if (s.monthlyFee === 0 && !s.admissionFee) {
            <p class="psd-warn">{{ s.className }} has no fees set yet. Set them in Classes &amp; Fees first.</p>
          }

          @if (s.admissionFee > 0 || !s.admissionPaid) {
            <div class="psd-adm" [class.psd-adm--paid]="s.admissionPaid">
              @if (s.admissionPaid) {
                <span><i class="pi pi-check-circle" aria-hidden="true"></i> Admission fee received</span>
              } @else {
                <label><input type="checkbox" [(ngModel)]="takeAdmission" /> Admission fee</label>
                <input pInputText type="number" min="1" [(ngModel)]="admissionAmount" [disabled]="!takeAdmission" aria-label="Admission amount" />
              }
            </div>
          }

          <p class="psd-label">Months <small class="app-muted">— tick the months being paid</small></p>
          <div class="psd-months">
            @for (m of monthChoices(); track m.month) {
              @if (m.isPaid) {
                <span class="psd-month psd-month--paid" [title]="'Paid on ' + m.receiptCode">{{ label(m.month) }}<small>{{ m.receiptCode }}</small></span>
              } @else {
                <label class="psd-month" [class.psd-month--on]="picked().has(m.month)" [class.psd-month--late]="m.month < thisMonth">
                  <input type="checkbox" [checked]="picked().has(m.month)" (change)="toggle(m.month)" />
                  {{ label(m.month) }}<small>{{ m.month < thisMonth ? 'overdue' : m.month === thisMonth ? 'this month' : 'advance' }}</small>
                </label>
              }
            }
          </div>

          <div class="psd-pay">
            <div class="psd-modes" role="radiogroup" aria-label="Payment mode">
              @for (mode of modes; track mode) {
                <label [class.psd-mode--on]="payMode === mode"><input type="radio" name="mode" [value]="mode" [(ngModel)]="payMode" /> {{ mode }}</label>
              }
            </div>
            @if (payMode !== 'Cash') {
              <label>{{ payMode }} reference <input pInputText [(ngModel)]="reference" maxlength="60" /></label>
            }
            <label>Date received <input pInputText type="date" [(ngModel)]="receivedOn" [max]="today" /></label>
            <label>Note (optional) <input pInputText [(ngModel)]="payNote" maxlength="300" /></label>
          </div>

          <div class="psd-total">
            <span>Total <strong>{{ money(total()) }}</strong></span>
            <p-button label="Collect and print receipt" icon="pi pi-print" [loading]="collecting()" [disabled]="total() <= 0" (onClick)="collect(s)" />
          </div>
        </section>
      }

      <section class="app-card psd-form">
        <h2>{{ isNew() ? 'Child and family' : 'Details' }}</h2>
        <div class="psd-grid">
          <label class="w2">Child's name * <input pInputText [(ngModel)]="form.childName" maxlength="100" /></label>
          <label>Date of birth * <input pInputText type="date" [(ngModel)]="form.dateOfBirth" [max]="today" /></label>
          <label>Gender
            <select [(ngModel)]="form.gender"><option [ngValue]="null">—</option><option value="Girl">Girl</option><option value="Boy">Boy</option></select></label>
          <label>Blood group <input pInputText [(ngModel)]="form.bloodGroup" maxlength="5" placeholder="B+" /></label>
          <label>Class *
            <select [(ngModel)]="form.classId">
              <option [ngValue]="0" disabled>Pick a class</option>
              @for (c of classes(); track c.id) { <option [ngValue]="c.id" [disabled]="!c.isActive">{{ c.name }}</option> }
            </select></label>
          <label>Joining date * <input pInputText type="date" [(ngModel)]="form.joinedOn" /></label>
          <label>Father's name <input pInputText [(ngModel)]="form.fatherName" maxlength="100" /></label>
          <label>Mother's name <input pInputText [(ngModel)]="form.motherName" maxlength="100" /></label>
          <label>Parent to contact * <input pInputText [(ngModel)]="form.parentName" maxlength="100" /></label>
          <label>Phone * <input pInputText type="tel" [(ngModel)]="form.phone" maxlength="15" placeholder="98300 00000" /></label>
          <label>Emergency phone <input pInputText type="tel" [(ngModel)]="form.emergencyPhone" maxlength="15" /></label>
          <label>Email <input pInputText type="email" [(ngModel)]="form.email" maxlength="150" /></label>
          <label class="w2">Address <textarea pInputText rows="2" [(ngModel)]="form.address" maxlength="400"></textarea></label>
          <label>Monthly discount (₹) <input pInputText type="number" min="0" [(ngModel)]="form.monthlyDiscount" /></label>
          @if (!isNew()) {
            <label>Status
              <select [(ngModel)]="form.status">
                <option value="Active">Studying</option><option value="Completed">Completed the class</option><option value="Left">Left</option>
              </select></label>
            @if (form.status !== 'Active') {
              <label>Completed / left on * <input pInputText type="date" [(ngModel)]="form.endedOn" /></label>
            }
          }
          <label class="w2">Notes <textarea pInputText rows="2" [(ngModel)]="form.notes" maxlength="500"></textarea></label>
        </div>
        <p-button [label]="isNew() ? 'Save admission' : 'Save details'" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </section>

      @if (!isNew() && student(); as s) {
        <section class="app-card psd-receipts">
          <h2>Receipts</h2>
          @for (r of s.receipts; track r.id) {
            <div class="psd-receipt" [class.psd-receipt--void]="r.isCancelled">
              <span><strong>{{ r.receiptCode }}</strong> · {{ r.receivedOn | date: 'd MMM y' }} · {{ r.mode }}@if (r.isCancelled) { · <em>Cancelled</em> }
                <small>{{ r.summary }}</small></span>
              <strong>{{ money(r.total) }}</strong>
              <span class="psd-receipt-actions">
                <p-button icon="pi pi-print" [text]="true" [rounded]="true" ariaLabel="Print receipt" (onClick)="print(r.id)" />
                <a [href]="share(s, r.receiptCode, r.total, r.summary)" target="_blank" rel="noopener" class="psd-wa" aria-label="Send to parent on WhatsApp"><i class="pi pi-whatsapp" aria-hidden="true"></i></a>
                @if (isHead() && !r.isCancelled) {
                  <p-button icon="pi pi-ban" [text]="true" [rounded]="true" severity="danger" ariaLabel="Cancel receipt" (onClick)="cancel(r.id, r.receiptCode)" />
                }
              </span>
            </div>
          } @empty {
            <p class="app-muted">No money received yet.</p>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .psd-back { display: inline-flex; gap: 0.35rem; align-items: center; margin-bottom: 0.5rem; color: var(--app-text-muted); text-decoration: none; font-size: 0.9rem; }
    .psd { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
    .psd--new { grid-template-columns: minmax(0, 46rem); }
    .psd h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .psd-fees, .psd-form, .psd-receipts { padding: 1rem 1.15rem; }
    .psd-receipts { grid-column: 1; }
    .psd-fee-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
    .psd-fee-head small { color: var(--app-text-muted); margin-left: 0.25rem; }
    .psd-warn { margin: 0 0 0.75rem; padding: 0.5rem 0.75rem; border-radius: 8px; background: #fff1d6; color: #7a4a00; }
    .psd-adm { display: flex; gap: 0.75rem; align-items: center; padding: 0.6rem 0.75rem; border-radius: 10px; background: #f5f3ff; margin-bottom: 0.9rem; }
    .psd-adm label { display: flex; gap: 0.4rem; align-items: center; font-weight: 700; }
    .psd-adm input[type='number'] { width: 8rem; }
    .psd-adm--paid { background: #e6f8e6; color: #2b7a2b; font-weight: 700; }
    .psd-label { margin: 0 0 0.4rem; font-weight: 700; font-size: 0.9rem; }
    .psd-months { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1rem; }
    .psd-month { display: inline-flex; flex-direction: column; align-items: center; min-width: 5.5rem; padding: 0.4rem 0.6rem;
      border: 2px solid #e4e6ef; border-radius: 12px; font-weight: 700; font-size: 0.85rem; cursor: pointer; background: #fff; }
    .psd-month input { position: absolute; opacity: 0; pointer-events: none; }
    .psd-month small { font-weight: 500; font-size: 0.7rem; color: var(--app-text-muted); }
    .psd-month--late { border-color: #f5b5b5; }
    .psd-month--late small { color: #b42318; }
    .psd-month--on { border-color: #ff6b8b; background: #fff0f4; }
    .psd-month--paid { background: #e6f8e6; border-color: #bfe6bf; color: #2b7a2b; cursor: default; }
    .psd-pay { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
    .psd-pay label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .psd-modes { grid-column: 1 / -1; display: flex; gap: 0.5rem; }
    .psd-modes label { flex-direction: row; align-items: center; gap: 0.35rem; padding: 0.4rem 0.9rem; border: 2px solid #e4e6ef; border-radius: 999px; cursor: pointer; font-size: 0.9rem; }
    .psd-modes .psd-mode--on { border-color: #6d28d9; background: #f5f3ff; }
    .psd-total { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1rem; padding-top: 0.9rem;
      border-top: 1px dashed var(--app-border); font-size: 1.1rem; flex-wrap: wrap; }
    .psd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
    .psd-grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .psd-grid select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .w2 { grid-column: 1 / -1; }
    .psd-receipt { display: grid; grid-template-columns: 1fr auto auto; gap: 0.75rem; align-items: center; padding: 0.55rem 0; border-bottom: 1px solid var(--app-border); }
    .psd-receipt small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .psd-receipt--void { opacity: 0.55; }
    .psd-receipt--void strong { text-decoration: line-through; }
    .psd-receipt-actions { display: flex; align-items: center; }
    .psd-wa { display: grid; place-items: center; width: 2.1rem; height: 2.1rem; border-radius: 50%; color: #1f9d55; text-decoration: none; }
    @media (max-width: 1000px) { .psd { grid-template-columns: 1fr; } }
    @media (max-width: 560px) { .psd-grid, .psd-pay { grid-template-columns: 1fr; } }
  `]
})
export class PreSchoolStudentComponent implements OnInit {
  private readonly students = inject(PreSchoolStudentService);
  private readonly preschool = inject(PreSchoolService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly modes: PreSchoolPayMode[] = ['Cash', 'UPI', 'Paytm'];
  readonly today = todayIso();
  readonly thisMonth = todayIso().slice(0, 8) + '01';
  readonly money = formatMoney;
  readonly label = monthLabel;

  readonly isNew = signal(true);
  readonly student = signal<PreSchoolStudentDetail | null>(null);
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly picked = signal(new Set<string>());
  readonly saving = signal(false);
  readonly collecting = signal(false);
  readonly isHead = computed(() => this.auth.hasAnyRole(['PreSchoolHead']));

  form: PreSchoolStudentSave = blankForm();
  takeAdmission = false;
  admissionAmount: number | null = null;
  payMode: PreSchoolPayMode = 'Cash';
  reference = '';
  receivedOn = todayIso();
  payNote = '';

  /** Every month billed so far, plus three ahead for paying in advance. */
  readonly monthChoices = computed<PreSchoolMonth[]>(() => {
    const s = this.student();
    if (!s) return [];
    const months = [...s.months];
    const seen = new Set(months.map(m => m.month));
    let next = months.length ? addMonths(months[months.length - 1].month, 1) : addMonths(this.thisMonth, 0);
    for (let i = 0; i < 3; i++, next = addMonths(next, 1)) {
      if (s.status === 'Active' && !seen.has(next)) months.push({ month: next, isPaid: false, amount: s.monthlyFee });
    }
    return months;
  });

  /** A method, not a computed: the admission tick and amount are plain form fields. */
  total(): number {
    const s = this.student();
    if (!s) return 0;
    const admission = this.takeAdmission && !s.admissionPaid ? Number(this.admissionAmount) || 0 : 0;
    return admission + this.picked().size * s.monthlyFee;
  }

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes));
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.isNew.set(false);
      this.load(id);
    }
  }

  private load(id: number): void {
    this.students.get(id).subscribe(s => {
      this.student.set(s);
      const { id: _id, admissionCode: _a, className: _c, monthlyFee: _m, admissionFee: _f, admissionPaid: _p, months: _ms, receipts: _r, ...editable } = s;
      this.form = { ...blankForm(), ...editable };
      this.takeAdmission = !s.admissionPaid && s.admissionFee > 0;
      this.admissionAmount = s.admissionFee || null;
      this.picked.set(new Set());
    });
  }

  toggle(month: string): void {
    const next = new Set(this.picked());
    if (next.has(month)) next.delete(month); else next.add(month);
    this.picked.set(next);
  }

  save(): void {
    const f = this.form;
    if (!f.childName.trim()) return this.warn('Enter the child\'s name.');
    if (!f.dateOfBirth) return this.warn('Enter the date of birth.');
    if (!f.classId) return this.warn('Pick a class.');
    if (!f.joinedOn) return this.warn('Pick the joining date.');
    if (!f.parentName.trim()) return this.warn('Enter the parent to contact.');
    if (!/^\+?[0-9 \-]{10,15}$/.test(f.phone.trim())) return this.warn('Enter a 10-digit phone number.');
    if (f.status !== 'Active' && !f.endedOn) return this.warn('Give the date the child completed the class or left.');

    const clean = (v: string | null) => (v ?? '').trim() || null;
    const body: PreSchoolStudentSave = {
      ...f, childName: f.childName.trim(), parentName: f.parentName.trim(), phone: f.phone.trim(),
      gender: f.gender || null, bloodGroup: clean(f.bloodGroup), fatherName: clean(f.fatherName), motherName: clean(f.motherName),
      emergencyPhone: clean(f.emergencyPhone), email: clean(f.email), address: clean(f.address), notes: clean(f.notes),
      monthlyDiscount: Number(f.monthlyDiscount) || 0, endedOn: f.status === 'Active' ? null : f.endedOn || null
    };

    this.saving.set(true);
    const existing = this.student();
    this.students.save(existing?.id ?? null, body).subscribe({
      next: saved => {
        this.saving.set(false);
        if (existing) {
          this.done('Details saved');
          this.load(saved.id);
        } else {
          this.done(`Admission saved · ${saved.admissionCode}`);
          void this.router.navigate(['/preschool/students', saved.id]).then(() => {
            this.isNew.set(false);
            this.load(saved.id);
          });
        }
      },
      error: () => this.saving.set(false)
    });
  }

  collect(s: PreSchoolStudentDetail): void {
    if (this.payMode !== 'Cash' && !this.reference.trim()) return this.warn(`Enter the ${this.payMode} reference number.`);
    if (this.takeAdmission && !s.admissionPaid && !(Number(this.admissionAmount) > 0)) return this.warn('Enter the admission amount.');

    // Opened now, while the click still counts as the user's, so the pop-up blocker lets it through.
    const win = openPendingDocumentWindow(820, 960);
    this.collecting.set(true);
    this.students.collect(s.id, {
      includeAdmission: this.takeAdmission && !s.admissionPaid,
      admissionAmount: this.takeAdmission ? Number(this.admissionAmount) || null : null,
      months: [...this.picked()].sort(),
      mode: this.payMode,
      reference: this.payMode === 'Cash' ? null : this.reference.trim(),
      receivedOn: this.receivedOn || null,
      notes: this.payNote.trim() || null
    }).subscribe({
      next: receipt => {
        this.collecting.set(false);
        this.show(win, receipt);
        this.done(`Received ${this.money(receipt.total)} · ${receipt.receiptCode}`);
        this.reference = '';
        this.payNote = '';
        this.load(s.id);
      },
      error: () => { this.collecting.set(false); win?.close(); }
    });
  }

  print(receiptId: number): void {
    const win = openPendingDocumentWindow(820, 960);
    this.students.receipt(receiptId).subscribe({ next: r => this.show(win, r), error: () => win?.close() });
  }

  cancel(receiptId: number, code: string): void {
    if (!confirm(`Cancel receipt ${code}? Its months will be due again. This cannot be undone.`)) return;
    this.students.cancelReceipt(receiptId).subscribe(() => {
      this.done(`${code} cancelled`);
      const s = this.student();
      if (s) this.load(s.id);
    });
  }

  share(s: PreSchoolStudentDetail, code: string, total: number, summary: string): string {
    return whatsAppLink(s.phone,
      `Avijan PreSchool: received ${this.money(total)} for ${s.childName} (${summary}). Receipt ${code}. Thank you.`);
  }

  private show(win: Window | null, receipt: PreSchoolReceipt): void {
    if (!writeDocumentWindow(win, preSchoolReceiptHtml(receipt))) {
      this.warn('The receipt window was blocked. Allow pop-ups for this site, then use the print button under Receipts.');
    }
  }

  private done(summary: string): void {
    this.messages.add({ severity: 'success', summary, life: 3000 });
  }

  private warn(detail: string): void {
    this.messages.add({ severity: 'warn', summary: 'Please check', detail, life: 4500 });
  }
}
