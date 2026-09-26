import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { formatMoney } from '../../core/format/money';
import { ApiResponse } from '../../core/models/api-response.model';
import { BranchListItem } from '../../core/models/master.model';
import {
  OtherIncomeList,
  OtherIncomeListItem,
  OtherIncomeSaveRequest
} from '../../core/models/other-income.model';
import { AuthService } from '../../core/services/auth.service';
import { MasterService } from '../../core/services/master.service';
import { OtherIncomeService } from '../../core/services/other-income.service';
import { MoveToExamFeeDialogComponent } from '../../shared/exam-fee/move-to-exam-fee-dialog.component';

/**
 * The non-fee income register — anything the institute earns that is not a
 * student fee or admission fee.
 *
 * `dbo.OIncome` was read-only until this screen existed: migrated rows with no way
 * to add more. It feeds the "Other income" line of the income report, so without
 * it that line could only shrink into history.
 */
@Component({
  selector: 'app-other-income',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TooltipModule,
    MoveToExamFeeDialogComponent
  ],
  providers: [ConfirmationService],
  templateUrl: './other-income.component.html',
  styleUrl: './other-income.component.scss'
})
export class OtherIncomeComponent {
  private readonly fb = inject(FormBuilder);
  private readonly income = inject(OtherIncomeService);
  private readonly masters = inject(MasterService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  /* ---- an exam fee typed in here, moved onto the student's exam fee ---- */
  moveVisible = false;
  readonly moveRow = signal<{ incomeId: number; purpose?: string; amount: number } | null>(null);

  openMove(row: { incomeId: number; purpose?: string; amount: number }): void {
    this.moveRow.set(row);
    this.moveVisible = true;
  }

  readonly data = signal<OtherIncomeList | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly branches = signal<BranchListItem[]>([]);

  /** Only an administrator may delete an entry, as with expenses. */
  readonly canDelete = computed(() => this.auth.hasAnyRole(['Admin']));

  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  readonly from = signal<Date | null>(null);
  readonly to = signal<Date | null>(null);
  readonly search = signal('');
  readonly branchFilter = signal<string | null>(null);

  readonly page = signal(1);
  readonly pageSize = signal(25);

  readonly today = new Date();

  readonly form = this.fb.nonNullable.group({
    purpose: ['', [Validators.required, Validators.maxLength(200)]],
    incomeDate: [new Date() as Date | null, [Validators.required]],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    // Required, so every entry reaches the branch report.
    branch: [null as string | null, [Validators.required]]
  });

  constructor() {
    this.load();

    this.masters.branches().subscribe({
      next: rows => this.branches.set(rows.filter(b => b.isActive))
    });
  }

  /* -------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    this.income
      .list(
        this.page(),
        this.pageSize(),
        this.toIsoDate(this.from()),
        this.toIsoDate(this.to()),
        this.search().trim() || null,
        this.branchFilter()
      )
      .subscribe({
        next: data => {
          this.data.set(data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.pageSize();
    const first = event.first ?? 0;

    this.pageSize.set(size);
    this.page.set(Math.floor(first / size) + 1);
    this.load();
  }

  applyFilter(): void {
    this.page.set(1);
    this.load();
  }

  clearFilter(): void {
    this.from.set(null);
    this.to.set(null);
    this.search.set('');
    this.branchFilter.set(null);
    this.applyFilter();
  }

  /* -------------------------------------------------------------- form */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Purpose, branch, date and an amount above zero are all required.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);

    const v = this.form.getRawValue();

    const payload: OtherIncomeSaveRequest = {
      purpose: v.purpose.trim(),
      incomeDate: this.toIsoDate(v.incomeDate),
      amount: v.amount ?? 0,
      branch: v.branch
    };

    const id = this.editingId();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.income.create(payload)
      : this.income.update(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Income recorded' : 'Income updated',
          detail: response.message ?? 'Saved.',
          life: 5000
        });
        this.resetForm();
        this.load();
      },
      error: () => this.saving.set(false)
    });
  }

  edit(entry: OtherIncomeListItem): void {
    this.editingId.set(entry.incomeId);

    this.form.patchValue({
      purpose: entry.purpose ?? '',
      incomeDate: entry.incomeDate ? new Date(entry.incomeDate) : null,
      amount: entry.amount,
      branch: entry.branch ?? null
    });

    document.getElementById('oi-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    this.form.reset({ purpose: '', incomeDate: new Date(), amount: null, branch: null });
    this.editingId.set(null);
  }

  remove(entry: OtherIncomeListItem): void {
    this.confirm.confirm({
      header: 'Delete income entry',
      message:
        `Delete "${entry.purpose ?? 'this entry'}" (${this.money(entry.amount)})? ` +
        'This cannot be undone and it will change the income and branch reports.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.income.delete(entry.incomeId).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Deleted', life: 4000 });
            if (this.editingId() === entry.incomeId) this.resetForm();
            this.load();
          }
        });
      }
    });
  }

  money(value?: number | null): string {
    return formatMoney(value);
  }

  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }
}
