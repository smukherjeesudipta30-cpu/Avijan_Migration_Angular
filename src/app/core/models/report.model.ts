import { ExamFeeDueRow, StudentExamFee } from './exam-fee.model';
import { PagedResult } from './student.model';

/* ------------------------------------------------------------- admissions */

export interface AdmissionRow {
  studentId: number;
  registrationId?: string;
  studentName?: string;
  phone?: string;
  dateOfJoining?: string;
  courseName?: string;
  admissionFees: number;
}

export interface AdmissionsReport {
  from: string;
  to: string;
  studentCount: number;
  totalAdmissionFees: number;
  rows: PagedResult<AdmissionRow>;
  generatedOn: string;
}

/* ------------------------------------------------------------------- dues */

export interface DuesRow {
  studentId: number;
  registrationId?: string;
  studentName?: string;
  phone?: string;
  dateOfJoining?: string;
  courseName?: string;
  admissionFees: number;
  lastPaymentDate?: string;

  /** What they owe as at the report's end date: monthly fees due + fine + carried. */
  outstandingDue: number;

  /** The balance left unpaid at the time of the last payment. Usually zero. */
  carriedDue: number;

  /** Complete fee months since the last payment — a fee month being 32 days. */
  monthsUnpaid: number;

  /** The agreed monthly fee, which is what each missed month costs. */
  monthlyFee: number;

  /** The fine as at the report's end date, from the same calculator the desk uses. */
  lateFine: number;

  /** False when the student has no payment history at all. */
  hasEverPaid: boolean;
}

export interface DuesReport {
  from: string;
  to: string;
  courseId: number;
  courseName?: string;
  studentCount: number;
  neverPaidCount: number;
  totalOutstanding: number;
  rows: PagedResult<DuesRow>;
  generatedOn: string;
}

/* ------------------------------------------------------- pending payments */

export interface PendingPaymentRow {
  studentId: number;
  registrationId?: string;
  studentName?: string;
  phone?: string;
  branch?: string;
  courseName?: string;

  /** Every teacher assigned to the student, in any of their three slots. */
  teachers: string[];

  dateOfJoining?: string;

  /** Absent for a student who has never paid a monthly fee. */
  lastPaymentDate?: string;

  monthlyFee: number;
  monthsUnpaid: number;
  carriedDue: number;
  lateFine: number;

  /** Carried balance + unpaid months + fine. */
  outstandingDue: number;

  /**
   * Still owed on the admission fee. Shown beside the monthly arrears but
   * deliberately not added into `outstandingDue` — the two are settled apart.
   */
  admissionDue?: number;
}

/** A student carrying an unpaid balance on their admission fee. */
export interface AdmissionDueRow {
  studentId: number;
  registrationId?: string;
  studentName?: string;
  phone?: string;
  branch?: string;
  courseName?: string;
  dateOfJoining?: string;
  admissionFees: number;
  admissionFeesPaid: number;
  admissionDue: number;
  /** When the last money against this admission fee came in. */
  lastPaidOn?: string;
}

export interface PendingBranchTotal {
  branch: string;
  neverPaidCount: number;
  regularCount: number;
  totalOutstanding: number;
  /** Unpaid admission fees for the branch, kept apart from the monthly arrears. */
  totalAdmissionDue?: number;
}

export interface PendingPaymentsReport {
  from: string;
  to: string;
  branch?: string;
  courseId: number;
  courseName?: string;

  /** No monthly payment since admission — the admission fee does not count. */
  neverPaid: PendingPaymentRow[];

  /** Paid before, and has since fallen behind. */
  regular: PendingPaymentRow[];

  branchTotals: PendingBranchTotal[];
  totalOutstanding: number;
  generatedOn: string;

  /**
   * Students still owing part of their admission fee. Not bounded by the report's
   * date range: an admission balance is outstanding today or it is not, and a
   * student up to date on monthly fees can still owe it.
   */
  admissionDues?: AdmissionDueRow[];

  totalAdmissionDue?: number;

  /** Students scheduled for an exam who still owe exam fee (as it stands today). */
  examFeeDues?: ExamFeeDueRow[];

  totalExamFeeDue?: number;
}

/* ------------------------------------------------------ fee collections */

export interface FeeCollectionRow {
  paidOn?: string;
  kind: string;
  registrationId?: string;
  studentName?: string;
  branch?: string;
  amount: number;
  paymentMode?: 'Cash' | 'Bank';
  collectedBy?: string;
  billNo?: string;
}

export interface FeeCollectionTotal {
  branch: string;
  collectedBy: string;
  paymentMode: string;
  paymentCount: number;
  amount: number;
}

export interface FeeCollectionsReport {
  from: string;
  to: string;
  branch?: string;
  paymentMode?: string;

  rows: FeeCollectionRow[];
  totals: FeeCollectionTotal[];

  cashTotal: number;
  bankTotal: number;
  grandTotal: number;
  generatedOn: string;

  /** The same money split by what it was for. Always for the whole range, whatever the kind filter. */
  monthlyTotal?: number;
  admissionTotal?: number;
  monthlyCount?: number;
  admissionCount?: number;
  examFeeTotal?: number;
  examFeeCount?: number;
}

/* --------------------------------------------------------------- expenses */

export interface ExpenseRow {
  expenseId: number;
  details?: string;
  expenseDate?: string;
  amount: number;

  /** Where the money was spent. */
  branch?: string;
}

export interface ExpenseReport {
  from: string;
  to: string;
  entryCount: number;
  totalAmount: number;
  rows: PagedResult<ExpenseRow>;
  generatedOn: string;
}

/* -------------------------------------------------------- teacher account */

export interface TeacherEarningRow {
  studentName?: string;
  registrationId?: string;
  courseName?: string;
  paidOn?: string;
  salary: number;
}

export interface TeacherPaymentRow {
  expenseId: number;
  paidOn?: string;
  amount: number;
}

export interface TeacherEarningsReport {
  teacherId: number;
  teacherName?: string;
  teacherPhone?: string;
  from: string;
  to: string;
  /** Before any deduction. */
  totalEarned: number;
  /** Taken off for missed scan-outs — see `deductions` for which months and why. */
  totalDeduction: number;
  /** Earned minus the deduction. This, not totalEarned, is what is actually owed. */
  netEarned: number;
  totalPaid: number;
  /** Net earned minus paid; negative means the teacher has been overpaid. */
  pending: number;
  earnings: TeacherEarningRow[];
  payments: TeacherPaymentRow[];
  deductions: TeacherDeduction[];
  generatedOn: string;
}

/** Several teachers' accounts for one range, each as its own TeacherEarningsReport, with totals. */
export interface TeachersEarningsReport {
  from: string;
  to: string;
  teachers: TeacherEarningsReport[];
  totalEarned: number;
  totalDeduction: number;
  netEarned: number;
  totalPaid: number;
  pending: number;
  generatedOn: string;
}

/** The admin's own switch for the missed-scan-out deduction. */
export interface PayrollSettings {
  missedScanOutDeductionEnabled: boolean;
  /** Day of the month a receptionist's pay cycle starts on — 26 by default (26th to 25th), not the calendar month. */
  payCycleStartDay: number;
  modifiedBy?: string;
  modifiedOn?: string;
}

/** One calendar month's missed-scan-out penalty, with the reason spelled out. */
export interface TeacherDeduction {
  year: number;
  month: number;
  monthLabel: string;
  missedScanOutDays: number;
  deductionPercent: number;
  monthEarnings: number;
  deductionAmount: number;
  reason: string;
}

/* ----------------------------------------------------- students by teacher */

export interface StudentByTeacherRow {
  studentId: number;
  registrationId?: string;
  studentName?: string;
  guardianName?: string;
  address?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  courseName?: string;
  courseDuration?: number;
  monthlyFees: number;
  teacherCount?: number;
  /** Which of the three teacher slots the filtered teacher sits in. */
  matchedSlot: number;
  teacher1Name?: string;
  teacher1Phone?: string;
  teacher2Name?: string;
  teacher2Phone?: string;
  teacher3Name?: string;
  teacher3Phone?: string;
  isActive: boolean;
  isComplete: boolean;
}

export interface StudentsByTeacherReport {
  teacherId: number;
  teacherName?: string;
  studentCount: number;
  rows: PagedResult<StudentByTeacherRow>;
  generatedOn: string;
}

/* -------------------------------------------------------------- statement */

export interface StatementPayment {
  feeId: number;
  billNo?: string;
  paymentDate?: string;
  /** What was taken at the counter, fine included. */
  amountPaid: number;
  instalmentOnly: number;
  fine: number;
  dueAfter: number;
  courseName?: string;
}

export interface StatementSubject {
  subject?: string;
  fullMarks: number;
  obtainedMarks: number;
}

export interface StatementMark {
  markId: number;
  examDate?: string;
  subjects: StatementSubject[];
  totalFullMarks: number;
  totalObtainedMarks: number;
  percentScored: number;
  grade: string;
}

export interface StudentStatement {
  studentId: number;
  registrationId?: string;
  studentName?: string;
  guardianName?: string;
  phone?: string;
  email?: string;
  dateOfJoining?: string;
  dateOfExit?: string;
  courseName?: string;
  courseDuration?: number;
  admissionFees: number;
  agreedMonthlyFees: number;
  isActive: boolean;
  isComplete: boolean;
  hasPhoto: boolean;

  paymentCount: number;
  totalPaid: number;
  totalFines: number;
  currentDue: number;
  monthsPaid: number;

  payments: StatementPayment[];
  marks: StatementMark[];
  generatedOn: string;
  /** The exam fee: charged, paid, owed and each payment. */
  examFee?: StudentExamFee | null;
}

/* ------------------------------------------------------------ certificate */

/**
 * The course-completion certificate a student downloads from their statement.
 * Every field is read server-side from their own record — the legacy version
 * passed name, course and grade through the query string of a printable page.
 */
export interface StudentCertificate {
  studentName?: string;
  guardianName?: string;
  registrationId?: string;
  courseName?: string;
  courseDuration?: number;
  dateOfJoining?: string;
  examDate?: string;

  totalFullMarks: number;
  totalObtainedMarks: number;
  percentScored: number;
  grade: string;

  /** False while the student is still enrolled; the page warns rather than refuses. */
  isComplete: boolean;
  generatedOn: string;

  /** Which copy this is. 1 is the original; 2 and above print as duplicates. */
  issueNo: number;

  /** True from the second copy onwards. */
  isDuplicate: boolean;

  /** When the original was taken. Null on the original itself. */
  originalIssuedOn?: string;

  /** "AVI-C-000123", printed on the certificate. */
  certificateNo?: string | null;
  /** What the QR code carries; checked at avijan.in/verify/{code}. */
  verifyCode?: string | null;
  /** The signatory Admin set, and the signature and stamp as data: URLs. */
  signatoryName?: string | null;
  signatoryTitle?: string | null;
  signatureDataUrl?: string | null;
  stampDataUrl?: string | null;
}

/* ============================================================ pay slip */

export interface HonorariumPayslip {
  staffRole: 'Teacher' | 'Receptionist';
  staffId: number;
  staffName?: string;
  designation?: string;
  branch?: string;

  /** The first of the paid month. */
  payMonth: string;

  /** Sum of the payment(s) recorded for this person in that month. */
  amount: number;

  /** The date(s) money actually changed hands. */
  paidOn: string[];

  notes?: string;
  generatedOn: string;
}

/* ========================================================= branch report */

export type BranchGrouping = 'Month' | 'Quarter' | 'Year';

/** One branch in one period. */
export interface BranchPeriodRow {
  branch: string;
  periodStart: string;
  periodLabel: string;

  admissions: number;
  admissionFees: number;

  payments: number;
  feesCollected: number;
  lateFines: number;

  expenses: number;

  /** Non-fee income earned by this branch. */
  otherIncome: number;

  /** Receptionist salary paid by this branch. */
  receptionistPay: number;
  /** Admission referral commission in the period, already deducted in net. */
  referralCommission: number;
  /** Exam fees collected in the period, already included in net. */
  examFees: number;
  net: number;
}

export interface BranchTotal {
  branch: string;
  admissions: number;
  admissionFees: number;
  payments: number;
  feesCollected: number;
  lateFines: number;
  expenses: number;
  otherIncome: number;
  receptionistPay: number;
  /** Admission referral commission in the period, already deducted in net. */
  referralCommission: number;
  /** Exam fees collected in the period, already included in net. */
  examFees: number;
  net: number;
}

export interface BranchReport {
  from: string;
  to: string;
  groupBy: string;

  rows: BranchPeriodRow[];
  branchTotals: BranchTotal[];
  grandTotal: BranchTotal;

  branches: string[];

  /** True while most records carry no branch, so the page can say so. */
  mostlyUnassigned: boolean;

  generatedOn: string;
}
