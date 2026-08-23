import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { ApiResponse } from '../../core/models/api-response.model';
import { ExpenseList, ExpenseListItem, ExpenseSaveRequest } from '../../core/models/expense.model';
import { AuthService } from '../../core/services/auth.service';
import { ExpenseService } from '../../core/services/expense.service';

/**
 * The institute expense register. Replaces `Views/Expense/Index.cshtml` +
 * `Scripts/Expense.js`.
 *
 * The legacy page fetched the whole table on every save and paged it in the
 * browser, so its running total only covered the rows on screen. Paging and the
 * totals are both server-side here.
 */
@Component({
  selector: 'app-expenses',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    TableModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss'
})
export class ExpensesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly expenses = inject(ExpenseService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly data = signal<ExpenseList | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  /** Only an administrator may delete an expense. */
  readonly canDelete = computed(() => this.auth.hasAnyRole(['Admin']));

  readonly from = signal<Date | null>(null);
  readonly to = signal<Date | null>(null);
  readonly search = signal('');

  readonly page = signal(1);
  readonly pageSize = signal(25);

  readonly today = new Date();

  readonly form = this.fb.nonNullable.group({
    details: ['', [Validators.required, Validators.maxLength(500)]],
    expenseDate: [new Date() as Date | null, [Validators.required]],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]]
  });

  constructor() {
    this.load();
  }

  /* -------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    this.expenses
      .list(
        this.page(),
        this.pageSize(),
        this.toIsoDate(this.from()),
        this.toIsoDate(this.to()),
        this.search().trim() || null
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
    this.applyFilter();
  }

  /* -------------------------------------------------------------- form */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Details, date and an amount above zero are all required.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);

    const v = this.form.getRawValue();

    const payload: ExpenseSaveRequest = {
      details: v.details.trim(),
      expenseDate: this.toIsoDate(v.expenseDate),
      amount: v.amount ?? 0
    };

    const id = this.editingId();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.expenses.create(payload)
      : this.expenses.update(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Expense saved' : 'Expense updated',
          detail: response.message ?? 'Saved.',
          life: 5000
        });
        this.resetForm();
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof HttpErrorResponse) {
          const body = error.error as ApiResponse<unknown> | null;
          const detail = body?.errors?.length ? body.errors.join(' ') : body?.message;
          if (detail) {
            this.messages.add({ severity: 'error', summary: 'Could not save', detail, life: 8000 });
          }
        }
      }
    });
  }

  edit(expense: ExpenseListItem): void {
    this.editingId.set(expense.expenseId);

    this.form.patchValue({
      details: expense.details ?? '',
      expenseDate: expense.expenseDate ? new Date(expense.expenseDate) : null,
      amount: expense.amount
    });

    document.getElementById('expense-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    // The date resets to today rather than empty, the way the legacy picker opened.
    this.form.reset({ details: '', expenseDate: new Date(), amount: null });
    this.editingId.set(null);
  }

  remove(expense: ExpenseListItem): void {
    this.confirm.confirm({
      header: 'Delete expense',
      message:
        `Delete "${expense.details ?? 'this expense'}" ` +
        `(${expense.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })})? ` +
        'This cannot be undone and it will change the income and expense reports.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.expenses.delete(expense.expenseId).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Deleted', life: 4000 });

            // Stop editing a row that no longer exists.
            if (this.editingId() === expense.expenseId) this.resetForm();

            this.load();
          }
        });
      }
    });
  }

  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }
}
