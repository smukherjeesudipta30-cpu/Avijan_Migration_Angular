/** Mirrors the IncomeSection enum on the API (serialised as a string). */
export type IncomeSection =
  | 'Fees'
  | 'Admissions'
  | 'OtherIncome'
  | 'LateFines'
  | 'Expenses'
  | 'TeacherPayouts'
  | 'TeacherExpenses'
  | 'Dues';

export interface IncomeSectionTotal {
  section: IncomeSection;
  label: string;
  amount: number;
  rowCount: number;
  /** Counts against profit rather than towards it. */
  isCost: boolean;
  /** Informational only — excluded from the totals to avoid double counting. */
  isBreakdown: boolean;
}

export interface IncomeTrendPoint {
  year: number;
  month: number;
  label: string;
  income: number;
  cost: number;
  net: number;
}

export interface IncomeReport {
  from: string;
  to: string;

  feeCollections: number;
  admissionFees: number;
  otherIncome: number;
  totalIncome: number;

  /** Of which: the fine portion already inside feeCollections. */
  lateFines: number;

  expenses: number;
  teacherPayouts: number;
  teacherExpenses: number;
  totalCost: number;

  netProfit: number;
  marginPercent: number;
  duesMovement: number;

  sections: IncomeSectionTotal[];
  monthly: IncomeTrendPoint[];
  generatedOn: string;
}

export interface IncomeDetail {
  id: number;
  date?: string;
  reference?: string;
  studentName?: string;
  registrationId?: string;
  courseName?: string;
  teacherName?: string;
  description?: string;
  amount: number;
}
