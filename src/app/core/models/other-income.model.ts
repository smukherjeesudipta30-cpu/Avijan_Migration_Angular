import { PagedResult } from './student.model';

/** One non-fee income entry. */
export interface OtherIncomeListItem {
  incomeId: number;
  purpose?: string;
  incomeDate?: string;
  amount: number;
  branch?: string;
}

export interface OtherIncomeSummary {
  entryCount: number;
  totalAmount: number;
  from?: string;
  to?: string;
}

export interface OtherIncomeList {
  rows: PagedResult<OtherIncomeListItem>;
  summary: OtherIncomeSummary;
}

export interface OtherIncomeSaveRequest {
  purpose: string;
  /** Null on create means today. */
  incomeDate: string | null;
  amount: number;
  /** Required — every entry has to reach the branch report. */
  branch: string | null;
}
