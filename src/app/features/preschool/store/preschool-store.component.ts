import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { PreSchoolClass, todayIso } from '../../../core/models/preschool.model';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolStore, PreSchoolStoreItem, PreSchoolStoreService } from '../../../core/services/preschool-store.service';

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
      <p class="app-muted">Tuition books, bags and the like for each class. When a child is given an item on their page, it comes off the stock here.</p>
    </div>

    @for (g of groups(); track g.title) {
      <section class="app-card pst">
        <h2>{{ g.title }}</h2>
        <div class="pst__table">
          <table>
            <thead><tr><th>Item</th><th>Total received</th><th>Given</th><th>In stock</th><th>Children waiting</th><th></th></tr></thead>
            <tbody>
              @for (i of g.items; track i.id) {
                <tr [class.pst__off]="!i.isActive">
                  <td><strong>{{ i.name }}</strong>@if (!i.isActive) { <small> (not in use)</small> }</td>
                  <td>{{ i.received }}</td>
                  <td>{{ i.given }}</td>
                  <td><span class="pst__stock" [class.pst__stock--low]="i.inStock < i.studentsWaiting" [class.pst__stock--out]="i.inStock === 0">{{ i.inStock }}</span></td>
                  <td>{{ i.studentsWaiting }} <small class="app-muted">of {{ i.students }}</small></td>
                  <td class="pst__actions">
                    @if (stockFor() === i.id) {
                      <input pInputText type="number" min="1" [(ngModel)]="qty" placeholder="Qty" aria-label="Quantity received" />
                      <input pInputText [(ngModel)]="note" maxlength="200" placeholder="Note (optional)" aria-label="Note" />
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
        <label>Name <input pInputText [(ngModel)]="form.name" maxlength="100" placeholder="KG-1 tuition book set" /></label>
        <label>Class
          <select [(ngModel)]="form.classId">
            <option [ngValue]="null">All classes</option>
            @for (c of classes(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
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
                @if (m.kind === 'Out') { given to {{ m.studentName }} ({{ m.admissionCode }}) } @else { stock received@if (m.note) { — {{ m.note }} } }
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
    .pst__actions input + input { width: 11rem; }
    .pst__form { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; }
    .pst__form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .pst__form select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .pst__check { flex-direction: row !important; align-items: center; padding-bottom: 0.6rem; }
    .pst__move { display: grid; grid-template-columns: 3rem 1fr auto; gap: 0.6rem; align-items: center; padding: 0.45rem 0; border-bottom: 1px solid var(--app-border); }
    .pst__move small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .pst__kind { font-weight: 800; color: #2b7a2b; }
    .pst__kind--out { color: #b3264f; }
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

  qty: number | null = null;
  note = '';
  form = { name: '', classId: null as number | null, sortOrder: 0, isActive: true };

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes.filter(c => c.isActive)));
    this.load();
  }

  private load(): void { this.storeApi.store().subscribe(s => this.store.set(s)); }

  openStock(id: number): void { this.stockFor.set(id); this.qty = null; this.note = ''; }

  addStock(i: PreSchoolStoreItem): void {
    const qty = Number(this.qty);
    if (!Number.isInteger(qty) || qty < 1) return this.warn('Enter how many came in.');
    this.busy.set(true);
    this.storeApi.stockIn(i.id, qty, todayIso(), this.note.trim() || null).subscribe({
      next: () => { this.busy.set(false); this.stockFor.set(null); this.done(`${qty} added to ${i.name}`); this.load(); },
      error: () => this.busy.set(false)
    });
  }

  edit(i: PreSchoolStoreItem): void {
    this.editing.set(i.id);
    this.form = { name: i.name, classId: i.classId, sortOrder: i.sortOrder, isActive: i.isActive };
  }

  resetForm(): void {
    this.editing.set(null);
    this.form = { name: '', classId: null, sortOrder: 0, isActive: true };
  }

  saveItem(): void {
    if (!this.form.name.trim()) return this.warn('Give the item a name.');
    this.busy.set(true);
    this.storeApi.saveItem(this.editing(), { ...this.form, name: this.form.name.trim() }).subscribe({
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
