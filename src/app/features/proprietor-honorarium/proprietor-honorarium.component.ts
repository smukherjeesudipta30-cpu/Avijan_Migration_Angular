import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../core/models/api-response.model';
import { AuthService } from '../../core/services/auth.service';

interface HonorariumEntry {
  id: number;
  effectiveFrom: string;
  monthlyAmount: number;
  note?: string;
  createdBy?: string;
  createdOn: string;
}

interface Honorarium {
  currentMonthlyAmount: number | null;
  history: HonorariumEntry[];
}

/**
 * The proprietor's monthly honorarium. Admin sets it; Admin, Editor and
 * SuperAdmin can see it. It is deducted from the whole institute's net profit
 * in the Income report (never from one branch).
 */
@Component({
  selector: 'app-proprietor-honorarium',
  imports: [CommonModule, FormsModule, ButtonModule, DatePickerModule, InputNumberModule, InputTextModule, TableModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Finance</span>
      <h1>Proprietor honorarium</h1>
      <p class="app-muted">
        A monthly amount deducted from the institute's net profit in the Income report, month by month.
        It belongs to the whole institute, so branch-wise figures do not include it.
      </p>
    </div>

    <section class="app-card ph__card">
      <span class="app-muted">Current monthly honorarium</span>
      <strong class="ph__current">
        {{ data()?.currentMonthlyAmount != null ? money(data()!.currentMonthlyAmount!) : 'Not set' }}
      </strong>
    </section>

    @if (isAdmin()) {
      <section class="app-card ph__card">
        <h2>Set the amount</h2>
        <div class="ph__form">
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
          Applies from that month until you set a new amount, so earlier months keep what they had.
          Set 0 to stop it.
        </p>
      </section>
    }

    <section class="app-card ph__card">
      <h2>History</h2>
      <p-table [value]="data()?.history ?? []" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>From month</th>
            <th class="ph__num">Monthly amount</th>
            <th>Note</th>
            <th>Set by</th>
            @if (isAdmin()) { <th style="width: 4rem"></th> }
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-h>
          <tr>
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
          <tr><td colspan="5" class="app-muted">No honorarium set yet.</td></tr>
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
  `
})
export class ProprietorHonorariumComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly base = `${environment.apiBaseUrl}/proprietor-honorarium`;

  readonly data = signal<Honorarium | null>(null);
  readonly saving = signal(false);
  readonly isAdmin = computed(() => this.auth.hasAnyRole(['Admin', 'SuperAdmin']));

  month: Date | null = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  amount: number | null = null;
  note = '';

  ngOnInit(): void {
    this.http.get<ApiResponse<Honorarium>>(this.base).pipe(map(r => r.data))
      .subscribe({ next: d => this.data.set(d) });
  }

  save(): void {
    if (!this.month || this.amount === null) return;
    const m = this.month;
    const effectiveFrom = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-01`;
    this.saving.set(true);
    this.http.put<ApiResponse<Honorarium>>(this.base, { effectiveFrom, monthlyAmount: this.amount, note: this.note })
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
