import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolClass, todayIso } from '../../../core/models/preschool.model';
import { PRESCHOOL_CHARGE_HEADS } from '../../../core/models/preschool-student.model';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolService } from '../../../core/services/preschool.service';
import {
  PreSchoolStore, PreSchoolStoreItem, PreSchoolStoreService, PreSchoolSupplierPayment
} from '../../../core/services/preschool-store.service';

interface ClassGroup { title: string; items: PreSchoolStoreItem[]; }

/**
 * The PreSchool store, class by class: each item's total received (the
 * class's capacity), given to children, and left in stock, with how many
 * children are still waiting for it. The admin and receptionist enter stock
 * as it comes in; giving an item to a child is done on the child's page.
 */
@Component({
  selector: 'app-preschool-store',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>Store</h1>
      <p class="app-muted">Tuition kit, school bag, winter garments and prospectus for each class, bought from My Chhota School. Enter each delivery
        with its price per piece: it adds to what is owed. Record each bulk payment to My Chhota School below: payments are what the Income Report counts.
        When a child is given an item on their page, it comes off the stock here.</p>
    </div>

    @if (store()?.account; as a) {
      <section class="app-card pst pst-acc">
        <div class="pst-acc__head">
          <h2>My Chhota School account</h2>
          <div class="pst-acc__tiles">
            <div><span>Stock bought</span><strong>{{ money(a.bought) }}</strong></div>
            <div><span>Paid</span><strong class="pst-green">{{ money(a.paid) }}</strong></div>
            <div><span>{{ a.balance < 0 ? 'Paid in advance' : 'Balance due' }}</span>
              <strong [class.pst-red]="a.balance > 0" [class.pst-green]="a.balance <= 0">{{ money(a.balance < 0 ? -a.balance : a.balance) }}</strong></div>
          </div>
        </div>
        <div class="pst__form">
          <label>Date paid <input pInputText type="date" [(ngModel)]="pay.paidOn" [max]="today" /></label>
          <label>Amount (₹) <input pInputText type="number" min="1" [(ngModel)]="pay.amount" [placeholder]="a.balance > 0 ? '' + a.balance : '0'" /></label>
          <label>Mode
            <select [(ngModel)]="pay.mode">
              @for (m of payModes; track m) { <option [ngValue]="m">{{ m }}</option> }
            </select></label>
          @if (pay.mode !== 'Cash') {
            <label>{{ pay.mode === 'Cheque' ? 'Cheque no.' : 'Transaction ref.' }} <input pInputText [(ngModel)]="pay.reference" maxlength="60" /></label>
          }
          <label class="pst-acc__note">Note <input pInputText [(ngModel)]="pay.note" maxlength="300" placeholder="e.g. Kits and garments, Nov–Dec deliveries" /></label>
          @if (a.balance > 0) { <p-button label="Fill balance" [text]="true" size="small" (onClick)="pay.amount = a.balance" /> }
          <p-button label="Record payment" icon="pi pi-check" [loading]="paying()" (onClick)="recordPayment()" />
        </div>
        @if (a.payments.length) {
          <div class="pst__table pst-acc__list">
            <table>
              <thead><tr><th>Paid on</th><th>Amount</th><th>Mode</th><th>Reference</th><th>Note</th><th></th></tr></thead>
              <tbody>
                @for (p of a.payments; track p.id) {
                  <tr>
                    <td data-label="Paid on">{{ p.paidOn | date: 'd MMM y' }}</td>
                    <td data-label="Amount"><strong>{{ money(p.amount) }}</strong></td>
                    <td data-label="Mode">{{ p.mode }}</td>
                    <td data-label="Ref.">{{ p.reference ?? '—' }}</td>
                    <td class="pst__name">{{ p.note ?? '' }}@if (p.createdBy) { <small class="app-muted"> · {{ p.createdBy }}</small> }</td>
                    <td class="pst__actions">
                      @if (isHead()) {
                        <p-button icon="pi pi-times" size="small" [text]="true" [rounded]="true" severity="danger" ariaLabel="Remove payment" (onClick)="removePayment(p)" />
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="app-muted">No payments to My Chhota School recorded yet.</p>
        }
      </section>
    }

    @for (g of groups(); track g.title) {
      <section class="app-card pst">
        <h2>{{ g.title }}</h2>
        <div class="pst__table">
          <table>
            <thead><tr><th>Item</th><th>Price / piece</th><th>Total received</th><th>Given</th><th>In stock</th><th>Children waiting</th><th>Spent</th><th></th></tr></thead>
            <tbody>
              @for (i of g.items; track i.id) {
                <tr [class.pst__off]="!i.isActive">
                  <td class="pst__name"><strong>{{ i.name }}</strong>@if (!i.isActive) { <small> (not in use)</small> }
                    @if (headLabel(i.chargeHead); as h) { <small class="pst__head">Parents pay on: {{ h }}</small> }</td>
                  <td data-label="Price">{{ i.unitCost ? money(i.unitCost) : '—' }}</td>
                  <td data-label="Received">{{ i.received }}</td>
                  <td data-label="Given">{{ i.given }}</td>
                  <td data-label="In stock"><span class="pst__stock" [class.pst__stock--low]="i.inStock < i.studentsWaiting" [class.pst__stock--out]="i.inStock === 0">{{ i.inStock }}</span></td>
                  <td data-label="Waiting">{{ i.studentsWaiting }} <small class="app-muted">of {{ i.students }}</small></td>
                  <td data-label="Spent">{{ i.spent ? money(i.spent) : '—' }}</td>
                  <td class="pst__actions">
                    @if (stockFor() === i.id) {
                      <input pInputText type="number" min="1" [(ngModel)]="qty" placeholder="Qty" aria-label="Quantity received" />
                      <input pInputText type="number" min="0" [(ngModel)]="unitCost" placeholder="₹ / piece" aria-label="Price paid per piece" />
                      <input pInputText class="pst__wide" [(ngModel)]="supplier" maxlength="100" placeholder="Supplier" aria-label="Supplier" />
                      <input pInputText class="pst__wide" [(ngModel)]="note" maxlength="200" placeholder="Bill no. / note" aria-label="Note" />
                      @if ((qty ?? 0) > 0 && (unitCost ?? 0) > 0) { <strong class="pst__total">{{ money((qty ?? 0) * (unitCost ?? 0)) }}</strong> }
                      <p-button label="Add" size="small" [loading]="busy()" (onClick)="addStock(i)" />
                      <p-button label="Cancel" size="small" [text]="true" (onClick)="stockFor.set(null)" />
                    } @else {
                      <p-button label="Stock in" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="openStock(i.id)" />
                      <p-button icon="pi pi-pencil" size="small" [text]="true" [rounded]="true" ariaLabel="Edit item" (onClick)="edit(i)" />
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }

    <section class="app-card pst">
      <h2>{{ editing() ? 'Edit item' : 'Add an item' }}</h2>
      <div class="pst__form">
        <label>Name <input pInputText [(ngModel)]="form.name" maxlength="100" placeholder="Tuition Kit" /></label>
        <label>Class
          <select [(ngModel)]="form.classId">
            <option [ngValue]="null">All classes</option>
            @for (c of classes(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
          </select></label>
        <label>Usual price / piece (₹) <input pInputText type="number" min="0" [(ngModel)]="form.unitCost" placeholder="0" /></label>
        <label>Parents pay for it on
          <select [(ngModel)]="form.chargeHead">
            <option [ngValue]="null">— (not charged separately)</option>
            @for (h of chargeHeads; track h.head) { <option [ngValue]="h.head">{{ h.label }}</option> }
          </select></label>
        <label class="pst__check"><input type="checkbox" [(ngModel)]="form.isActive" /> In use</label>
        <p-button [label]="editing() ? 'Save item' : 'Add item'" icon="pi pi-check" [loading]="busy()" (onClick)="saveItem()" />
        @if (editing()) { <p-button label="Cancel" [text]="true" (onClick)="resetForm()" /> }
      </div>
    </section>

    @if (store(); as s) {
      <section class="app-card pst">
        <h2>Latest entries</h2>
        @for (m of s.recent; track m.id) {
          <div class="pst__move">
            <span class="pst__kind" [class.pst__kind--out]="m.kind === 'Out'">{{ m.kind === 'In' ? '+' + m.quantity : '−' + m.quantity }}</span>
            <span><strong>{{ m.itemName }}</strong>
              <small>{{ m.onDate | date: 'd MMM y' }} ·
                @if (m.kind === 'Out') { given to {{ m.studentName }} ({{ m.admissionCode }}) } @else {
                  received@if (m.supplier) { from {{ m.supplier }} }@if (m.unitCost) { · {{ m.quantity }} × {{ money(m.unitCost) }} = {{ money(m.quantity * m.unitCost) }} }@if (m.note) { — {{ m.note }} } }
                @if (m.createdBy) { · {{ m.createdBy }} }</small></span>
            @if (isHead()) {
              <p-button icon="pi pi-times" size="small" [text]="true" [rounded]="true" severity="danger" ariaLabel="Remove entry" (onClick)="remove(m.id)" />
            }
          </div>
        } @empty {
          <p class="app-muted">Nothing received or given yet.</p>
        }
      </section>
    }
  `,
  styles: [`
    .pst { margin-bottom: 1rem; }
    .pst h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .pst__table { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--app-border); white-space: nowrap; }
    th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--app-text-muted); }
    .pst__off { opacity: 0.55; }
    .pst__stock { display: inline-block; min-width: 2rem; padding: 0.1rem 0.5rem; border-radius: 999px; background: #e6f8e6; color: #2b7a2b; font-weight: 700; text-align: center; }
    .pst__stock--low { background: #fff1d6; color: #9a5b00; }
    .pst__stock--out { background: #fde2e2; color: #b42318; }
    .pst__actions { display: flex; gap: 0.35rem; align-items: center; }
    .pst__actions input { width: 6rem; }
    .pst__actions .pst__wide { width: 10rem; }
    .pst__total { white-space: nowrap; }
    .pst__head { display: block; font-size: 0.72rem; color: var(--app-text-muted); font-weight: 500; }
    .pst-acc__head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 0.75rem 1.5rem; margin-bottom: 0.9rem; }
    .pst-acc__head h2 { margin: 0; }
    .pst-acc__tiles { display: flex; flex-wrap: wrap; gap: 0.6rem; }
    .pst-acc__tiles div { min-width: 9rem; padding: 0.55rem 0.8rem; border: 1px solid var(--app-border); border-radius: 10px; }
    .pst-acc__tiles span { display: block; font-size: 0.74rem; color: var(--app-text-muted); }
    .pst-acc__tiles strong { font-size: 1.15rem; }
    .pst-acc__note { flex: 1 1 16rem; }
    .pst-acc__list { margin-top: 0.9rem; }
    .pst-green { color: #2b7a2b; }
    .pst-red { color: #b42318; }
    .pst__form { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }
    .pst__form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .pst__form select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .pst__check { flex-direction: row !important; align-items: center; padding-bottom: 0.6rem; }
    .pst__move { display: grid; grid-template-columns: 3rem 1fr auto; gap: 0.6rem; align-items: center; padding: 0.45rem 0; border-bottom: 1px solid var(--app-border); }
    .pst__move small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .pst__kind { font-weight: 800; color: #2b7a2b; }
    .pst__kind--out { color: #b3264f; }
    /* On a phone each item is a small card: name, then the four numbers side by side, then the buttons. */
    @media (max-width: 640px) {
      thead { display: none; }
      table, tbody { display: block; }
      tr { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.3rem 0.5rem; padding: 0.7rem 0; border-bottom: 1px solid var(--app-border); }
      td { border: 0; padding: 0; white-space: normal; }
      td[data-label]::before { content: attr(data-label); display: block; font-size: 0.66rem; text-transform: uppercase;
        letter-spacing: 0.04em; color: var(--app-text-muted); }
      .pst__name, .pst__actions { grid-column: 1 / -1; }
      .pst__actions { flex-wrap: wrap; margin-top: 0.3rem; }
    }
  `]
})
export class PreSchoolStoreComponent implements OnInit {
  private readonly storeApi = inject(PreSchoolStoreService);
  private readonly preschool = inject(PreSchoolService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly store = signal<PreSchoolStore | null>(null);
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly busy = signal(false);
  readonly stockFor = signal<number | null>(null);
  readonly editing = signal<number | null>(null);
  readonly isHead = computed(() => this.auth.hasAnyRole(['PreSchoolHead']));

  readonly groups = computed<ClassGroup[]>(() => {
    const out = new Map<string, PreSchoolStoreItem[]>();
    for (const i of this.store()?.items ?? []) out.set(i.className, [...(out.get(i.className) ?? []), i]);
    return [...out].map(([title, items]) => ({ title, items }));
  });

  readonly money = formatMoney;
  readonly chargeHeads = PRESCHOOL_CHARGE_HEADS;
  readonly today = todayIso();
  readonly payModes: PreSchoolSupplierPayment['mode'][] = ['Bank', 'UPI', 'Cheque', 'Cash'];
  readonly paying = signal(false);
  pay = { paidOn: todayIso(), amount: null as number | null, mode: 'Bank' as PreSchoolSupplierPayment['mode'], reference: '', note: '' };

  /** One bulk payment to My Chhota School, covering any number of deliveries. */
  recordPayment(): void {
    const amount = Number(this.pay.amount);
    if (!(amount > 0)) return this.warn('Enter the amount paid.');
    if (this.pay.mode !== 'Cash' && !this.pay.reference.trim()) return this.warn('Enter the transaction or cheque number.');
    this.paying.set(true);
    this.storeApi.addSupplierPayment({
      paidOn: this.pay.paidOn || null, amount, mode: this.pay.mode,
      reference: this.pay.mode === 'Cash' ? null : this.pay.reference.trim(), note: this.pay.note.trim() || null
    }).subscribe({
      next: account => {
        this.paying.set(false);
        this.store.update(s => s ? { ...s, account } : s);
        this.pay = { paidOn: todayIso(), amount: null, mode: this.pay.mode, reference: '', note: '' };
        this.done(`Payment of ${this.money(amount)} to My Chhota School recorded`);
      },
      error: () => this.paying.set(false)
    });
  }

  removePayment(p: PreSchoolSupplierPayment): void {
    if (!confirm(`Remove the payment of ${this.money(p.amount)} on ${p.paidOn}?`)) return;
    this.storeApi.removeSupplierPayment(p.id).subscribe(account => {
      this.store.update(s => s ? { ...s, account } : s);
      this.done('Payment removed');
    });
  }
  qty: number | null = null;
  unitCost: number | null = null;
  supplier = 'My Chhota School';
  note = '';
  form = { name: '', classId: null as number | null, sortOrder: 0, isActive: true, unitCost: null as number | null, chargeHead: null as string | null };

  headLabel(head: string | null | undefined): string | null {
    return PRESCHOOL_CHARGE_HEADS.find(h => h.head === head)?.label ?? null;
  }

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes.filter(c => c.isActive)));
    this.load();
  }

  private load(): void { this.storeApi.store().subscribe(s => this.store.set(s)); }

  openStock(id: number): void {
    const item = this.store()?.items.find(i => i.id === id);
    this.stockFor.set(id);
    this.qty = null;
    this.unitCost = item?.unitCost ?? null;
    this.supplier = 'My Chhota School';
    this.note = '';
  }

  addStock(i: PreSchoolStoreItem): void {
    const qty = Number(this.qty);
    if (!Number.isInteger(qty) || qty < 1) return this.warn('Enter how many came in.');
    const cost = this.unitCost === null || (this.unitCost as unknown) === '' ? null : Number(this.unitCost);
    if (cost !== null && !(cost >= 0)) return this.warn('The price cannot be negative.');
    if (cost === null && !confirm('No price entered: this delivery will not add to what is owed to My Chhota School. Continue?')) return;
    this.busy.set(true);
    this.storeApi.stockIn(i.id, qty, todayIso(), this.note.trim() || null, cost, this.supplier.trim() || null).subscribe({
      next: () => { this.busy.set(false); this.stockFor.set(null); this.done(`${qty} added to ${i.name}`); this.load(); },
      error: () => this.busy.set(false)
    });
  }

  edit(i: PreSchoolStoreItem): void {
    this.editing.set(i.id);
    this.form = { name: i.name, classId: i.classId, sortOrder: i.sortOrder, isActive: i.isActive,
      unitCost: i.unitCost ?? null, chargeHead: i.chargeHead ?? null };
  }

  resetForm(): void {
    this.editing.set(null);
    this.form = { name: '', classId: null, sortOrder: 0, isActive: true, unitCost: null, chargeHead: null };
  }

  saveItem(): void {
    if (!this.form.name.trim()) return this.warn('Give the item a name.');
    this.busy.set(true);
    const unitCost = this.form.unitCost === null || (this.form.unitCost as unknown) === '' ? null : Number(this.form.unitCost);
    this.storeApi.saveItem(this.editing(), { ...this.form, name: this.form.name.trim(), unitCost }).subscribe({
      next: () => { this.busy.set(false); this.done(this.editing() ? 'Item saved' : 'Item added'); this.resetForm(); this.load(); },
      error: () => this.busy.set(false)
    });
  }

  remove(id: number): void {
    if (!confirm('Remove this entry? The stock goes back as it was before it.')) return;
    this.storeApi.removeMovement(id).subscribe(() => { this.done('Entry removed'); this.load(); });
  }

  private done(summary: string): void { this.messages.add({ severity: 'success', summary, life: 2500 }); }
  private warn(detail: string): void { this.messages.add({ severity: 'warn', summary: 'Please check', detail, life: 4000 }); }
}
