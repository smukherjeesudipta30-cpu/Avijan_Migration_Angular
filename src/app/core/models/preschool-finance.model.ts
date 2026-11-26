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
  /** Registration, annual, kit, food, transport and the receipt's other rows. */
  otherFees?: number;
  income: number;
  salaries: number;
  expenses: number;
  /** Store stock bought (from My Chhota School), by the day it came in. */
  purchases?: number;
  /** Discounts and special offers given on receipts (already taken off income). */
  discounts?: number;
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
  purchases?: number;
  /** Fees received, by the login that collected them. */
  incomeByCollector?: Record<string, number> | null;
}

/** Suggested expense heads; any other can be typed. Salaries are not here: they come from the salary sheet. */
export const PRESCHOOL_EXPENSE_HEADS = [
  'Rent', 'Electricity', 'Teaching materials', 'Stationery', 'Toys and play items', 'Cleaning',
  'Repairs and maintenance', 'Events and celebrations', 'Tiffin and snacks', 'Internet and phone', 'Other'
];

/** An alert for the PreSchool admin, e.g. a staff member changed their password. */
export interface PreSchoolAlert {
  id: number;
  type: string;
  title: string;
  loginId?: string | null;
  createdOn: string;
  isRead: boolean;
  readBy?: string | null;
}

export interface PreSchoolAlerts {
  unread: number;
  items: PreSchoolAlert[];
}

export interface PreSchoolIncomeReceiptLine {
  receivedOn: string;
  receiptCode: string;
  childName: string;
  className: string;
  mode: string;
  admissionFee: number;
  monthlyFees: number;
  otherFees?: number;
  total: number;
  discount?: number;
  /** The login that took this payment. */
  collectedBy?: string | null;
  /** 1 for the payment made with the receipt, then 2, 3, 4 for later instalments. */
  instalmentNo?: number;
  /** The whole receipt, of which this payment is a part. */
  billTotal?: number;
}

export interface PreSchoolIncomeSalaryLine {
  paidOn: string;
  staffName: string;
  role: string;
  forMonth: string;
  mode: string;
  amount: number;
}

/** The PreSchool's money between any two dates, with every entry behind it. */
export interface PreSchoolIncomeRange {
  from: string;
  to: string;
  admissionFees: number;
  monthlyFees: number;
  otherFees?: number;
  income: number;
  salaries: number;
  expenses: number;
  /** Store stock bought (from My Chhota School), by the day it came in. */
  purchases?: number;
  /** Discounts and special offers given on receipts (already taken off income). */
  discounts?: number;
  net: number;
  incomeByMode: Record<string, number>;
  expensesByHead: Record<string, number>;
  /** Every payment received (a whole receipt or one instalment), with who collected it. */
  receipts: PreSchoolIncomeReceiptLine[];
  /** Fees received, by the login that collected them. */
  incomeByCollector?: Record<string, number> | null;
  purchaseEntries?: PreSchoolIncomePurchaseLine[];
  storeMargins?: PreSchoolStoreMargin[];
  /** Payments to My Chhota School in these dates (these make up purchases). */
  supplierPayments?: { id: number; supplier: string; paidOn: string; amount: number; mode: string; reference?: string | null; note?: string | null }[];
  /** Still owed to My Chhota School on the last day. */
  owedToSupplier?: number;
  /** Stock received in these dates at its price. */
  stockReceived?: number;
  salaryPayments: PreSchoolIncomeSalaryLine[];
  expenseEntries: PreSchoolExpense[];
}

/** One delivery of store stock and what it cost. */
export interface PreSchoolIncomePurchaseLine {
  onDate: string;
  itemName: string;
  className: string;
  supplier: string;
  quantity: number;
  unitCost: number;
  amount: number;
}

/** One kind of store item: what parents paid for it against what it cost to buy. */
export interface PreSchoolStoreMargin {
  item: string;
  chargeHead?: string | null;
  receivedFromParents: number;
  spent: number;
  margin: number;
  bought: number;
  given: number;
}
