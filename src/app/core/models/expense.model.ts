import { PagedResult } from './student.model';

export interface ExpenseListItem {
  expenseId: number;
  details?: string;
  expenseDate?: string;
  amount: number;
}

export interface ExpenseSaveRequest {
  details: string;
  /** Null on create means today; null on update keeps the stored date. */
  expenseDate: string | null;
  amount: number;
}

export interface ExpenseSummary {
  entryCount: number;
  totalAmount: number;
  from?: string;
  to?: string;
}

export interface ExpenseList {
  rows: PagedResult<ExpenseListItem>;
  /** Totals for everything the current filter selects, not just the visible page. */
  summary: ExpenseSummary;
}
