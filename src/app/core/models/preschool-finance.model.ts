/** Avijan PreSchool staff, salaries, expenses and income, as PreSchoolFinanceController returns them. Dates are "yyyy-MM-dd". */

export type PreSchoolStaffRole = 'Receptionist' | 'Teacher' | 'Housekeeper';
export type PreSchoolOutMode = 'Cash' | 'Bank' | 'UPI';

export interface PreSchoolStaff {
  id: number;
  name: string;
  role: PreSchoolStaffRole;
  phone?: string | null;
  email?: string | null;
  joinedOn: string;
  leftOn?: string | null;
  monthlySalary: number;
  notes?: string | null;
  isWorking: boolean;
}

export interface PreSchoolStaffSave {
  name: string;
  role: PreSchoolStaffRole;
  phone: string | null;
  email: string | null;
  joinedOn: string;
  leftOn: string | null;
  monthlySalary: number;
  notes: string | null;
}

export interface PreSchoolSalaryPayment {
  id: number;
  staffId: number;
  staffName: string;
  role: PreSchoolStaffRole;
  forMonth: string;
  paidOn: string;
  salary: number;
  daysAbsent: number;
  deduction: number;
  netPaid: number;
  netPaidInWords: string;
  mode: PreSchoolOutMode;
  reference?: string | null;
  notes?: string | null;
  paidBy?: string | null;
  schoolName: string;
  schoolAddress?: string | null;
}

export interface PreSchoolSalaryRow {
  staffId: number;
  name: string;
  role: PreSchoolStaffRole;
  monthlySalary: number;
  payment?: PreSchoolSalaryPayment | null;
}

export interface PreSchoolSalarySheet {
  month: string;
  rows: PreSchoolSalaryRow[];
  totalSalary: number;
  totalPaid: number;
  totalUnpaid: number;
}

export interface PreSchoolSalaryPay {
  staffId: number;
  forMonth: string;
  paidOn: string | null;
  daysAbsent: number;
  deduction: number;
  mode: PreSchoolOutMode;
  reference: string | null;
  notes: string | null;
}

export interface PreSchoolExpense {
  id: number;
  spentOn: string;
  head: string;
  description?: string | null;
  amount: number;
  mode: PreSchoolOutMode;
  reference?: string | null;
  createdBy?: string | null;
}

export interface PreSchoolExpenseSave {
  spentOn: string;
  head: string;
  description: string | null;
  amount: number;
  mode: PreSchoolOutMode;
  reference: string | null;
}

export interface PreSchoolIncomeMonth {
  month: string;
  admissionFees: number;
  monthlyFees: number;
  income: number;
  salaries: number;
  expenses: number;
  net: number;
}

export interface PreSchoolIncomeReport {
  year: number;
  months: PreSchoolIncomeMonth[];
  income: number;
  salaries: number;
  expenses: number;
  net: number;
  incomeByMode: Record<string, number>;
  expensesByHead: Record<string, number>;
}

/** Suggested expense heads; any other can be typed. Salaries are not here: they come from the salary sheet. */
export const PRESCHOOL_EXPENSE_HEADS = [
  'Rent', 'Electricity', 'Teaching materials', 'Stationery', 'Toys and play items', 'Cleaning',
  'Repairs and maintenance', 'Events and celebrations', 'Tiffin and snacks', 'Internet and phone', 'Other'
];
