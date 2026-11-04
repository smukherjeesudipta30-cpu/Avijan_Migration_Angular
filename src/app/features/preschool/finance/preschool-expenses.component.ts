import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { formatMoney } from '../../../core/format/money';
import { todayIso } from '../../../core/models/preschool.model';
import { PRESCHOOL_EXPENSE_HEADS, PreSchoolExpense, PreSchoolExpenseSave } from '../../../core/models/preschool-finance.model';
import { monthLabel } from '../../../core/models/preschool-student.model';
import { PreSchoolFinanceService } from '../../../core/services/preschool-finance.service';

const blank = (): PreSchoolExpenseSave => ({ spentOn: todayIso(), head: 'Rent', description: null, amount: 0, mode: 'Cash', reference: null });

function shiftMonth(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-01`;
}

function lastOfMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${y}-${`${m}`.padStart(2, '0')}-${new Date(y, m, 0).getDate()}`;
}

/**
 * The PreSchool's own expenses — rent, electricity, materials — kept apart from
 * the Computer Centre's. Salaries are not entered here: the income report
 * takes them from the salary sheet. PreSchool admin only.
 */
@Component({
  selector: 'app-preschool-expenses',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool · Accounts</span>
      <h1>Expenses</h1>
      <p class="app-muted">Money the PreSchool spends. Salaries are not entered here; they come from Staff &amp; Salary.</p>
    </div>

    <div class="pse">
      <section class="app-card pse-card">
        <h2>{{ editId() === null ? 'Add an expense' : 'Edit expense' }}</h2>
        <div class="pse-form">
          <label>Date <input pInputText type="date" [(ngModel)]="form.spentOn" [max]="today" /></label>
          <label>Amount (₹) <input pInputText type="number" min="1" [(ngModel)]="form.amount" /></label>
          <label class="w2">Spent on
            <input pInputText [(ngModel)]="form.head" list="pse-heads" maxlength="60" />
            <datalist id="pse-heads">@for (h of heads; track h) { <option [value]="h"></option> }</datalist></label>
          <label class="w2">Details <input pInputText [(ngModel)]="form.description" maxlength="300" placeholder="November rent to the landlord" /></label>
          <label>Paid by
            <select [(ngModel)]="form.mode"><option>Cash</option><option>Bank</option><option>UPI</option></select></label>
          @if (form.mode !== 'Cash') { <label>Reference <input pInputText [(ngModel)]="form.reference" maxlength="60" /></label> }
        </div>
        <div class="pse-buttons">
          <p-button [label]="editId() === null ? 'Add expense' : 'Save'" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
          @if (editId() !== null) { <p-button label="Cancel" severity="secondary" [outlined]="true" (onClick)="reset()" /> }
        </div>
      </section>

      <section class="app-card pse-card">
        <div class="pse-month">
          <p-button icon="pi pi-chevron-left" [text]="true" [rounded]="true" ariaLabel="Previous month" (onClick)="setMonth(shift(month(), -1))" />
          <h2>{{ label(month()) }}</h2>
          <p-button icon="pi pi-chevron-right" [text]="true" [rounded]="true" ariaLabel="Next month" (onClick)="setMonth(shift(month(), 1))" />
          <span class="pse-total">Total <strong>{{ money(total()) }}</strong></span>
        </div>
        @for (e of list(); track e.id) {
          <div class="pse-row">
            <span class="pse-date">{{ e.spentOn | date: 'd MMM' }}</span>
            <span><strong>{{ e.head }}</strong>@if (e.description) { <small>{{ e.description }}</small> }</span>
            <span class="pse-mode">{{ e.mode }}</span>
            <strong>{{ money(e.amount) }}</strong>
            <span class="pse-actions">
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" ariaLabel="Edit" (onClick)="edit(e)" />
              <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" ariaLabel="Remove" (onClick)="remove(e)" />
            </span>
          </div>
        } @empty {
          <p class="app-muted">No expenses in {{ label(month()) }}.</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .pse { display: grid; grid-template-columns: minmax(18rem, 26rem) 1fr; gap: 1rem; align-items: start; }
    .pse-card { padding: 1rem 1.15rem; }
    .pse-card h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .pse-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin-bottom: 0.9rem; }
    .pse-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .pse-form select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .w2 { grid-column: 1 / -1; }
    .pse-buttons { display: flex; gap: 0.6rem; }
    .pse-month { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.4rem; }
    .pse-month h2 { margin: 0; }
    .pse-total { margin-left: auto; }
    .pse-row { display: grid; grid-template-columns: 4rem 1fr auto auto auto; gap: 0.6rem; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--app-border); }
    .pse-row small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .pse-date { color: #b3264f; font-weight: 700; }
    .pse-mode { font-size: 0.8rem; color: var(--app-text-muted); }
    .pse-actions { display: flex; }
    @media (max-width: 900px) { .pse { grid-template-columns: 1fr; } }
  `]
})
export class PreSchoolExpensesComponent implements OnInit {
  private readonly finance = inject(PreSchoolFinanceService);
  private readonly messages = inject(MessageService);

  readonly heads = PRESCHOOL_EXPENSE_HEADS;
  readonly today = todayIso();
  readonly money = formatMoney;
  readonly label = monthLabel;
  readonly shift = shiftMonth;

  readonly month = signal(todayIso().slice(0, 8) + '01');
  readonly list = signal<PreSchoolExpense[]>([]);
  readonly editId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly total = computed(() => this.list().reduce((n, e) => n + e.amount, 0));

  form: PreSchoolExpenseSave = blank();

  ngOnInit(): void { this.load(); }

  setMonth(m: string): void { this.month.set(m); this.load(); }

  private load(): void {
    this.finance.expenses(this.month(), lastOfMonth(this.month())).subscribe(l => this.list.set(l));
  }

  edit(e: PreSchoolExpense): void {
    this.editId.set(e.id);
    this.form = { spentOn: e.spentOn, head: e.head, description: e.description ?? null, amount: e.amount, mode: e.mode, reference: e.reference ?? null };
  }

  reset(): void { this.editId.set(null); this.form = blank(); }

  save(): void {
    const f = this.form;
    if (!f.spentOn) return this.warn('Pick the date.');
    if (!f.head?.trim()) return this.warn('Say what the money was spent on.');
    if (!(Number(f.amount) > 0)) return this.warn('Enter the amount.');
    this.saving.set(true);
    this.finance.saveExpense(this.editId(), {
      ...f, head: f.head.trim(), amount: Number(f.amount), description: f.description?.trim() || null,
      reference: f.mode === 'Cash' ? null : f.reference?.trim() || null
    }).subscribe({
      next: saved => {
        this.saving.set(false);
        this.messages.add({ severity: 'success', summary: this.editId() === null ? 'Expense added' : 'Expense saved', life: 2500 });
        this.reset();
        const m = saved.spentOn.slice(0, 8) + '01';
        if (m !== this.month()) this.month.set(m);
        this.load();
      },
      error: () => this.saving.set(false)
    });
  }

  remove(e: PreSchoolExpense): void {
    if (!confirm(`Remove the ${e.head} expense of ${this.money(e.amount)}?`)) return;
    this.finance.deleteExpense(e.id).subscribe(() => {
      this.messages.add({ severity: 'success', summary: 'Expense removed', life: 2500 });
      if (this.editId() === e.id) this.reset();
      this.load();
    });
  }

  private warn(detail: string): void { this.messages.add({ severity: 'warn', summary: 'Please check', detail, life: 4500 }); }
}
