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
import { TableModule } from 'primeng/table';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { BranchListItem } from '../../core/models/master.model';
import { AuthService } from '../../core/services/auth.service';
import { MasterService } from '../../core/services/master.service';

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
    CommonModule, FormsModule, ButtonModule, DatePickerModule, InputNumberModule, InputTextModule, SelectModule, TableModule
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
      <h2>History</h2>
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
  `
})
export class ProprietorHonorariumComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly masters = inject(MasterService);
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

  ngOnInit(): void {
    this.http.get<ApiResponse<Honorarium>>(this.base).pipe(map(r => r.data))
      .subscribe({ next: d => this.data.set(d) });

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
