import { PagedResult } from './student.model';

export interface ExpenseListItem {
  expenseId: number;
  details?: string;
  expenseDate?: string;
  amount: number;

  /** Where the money was spent. Absent on entries taken before branches were recorded. */
  branch?: string;
}

export interface ExpenseSaveRequest {
  details: string;
  /** Null on create means today; null on update keeps the stored date. */
  expenseDate: string | null;
  amount: number;

  /** Optional — an expense belonging to no single branch is better left blank. */
  branch: string | null;
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
