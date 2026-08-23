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
  outstandingDue: number;
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

/* --------------------------------------------------------------- expenses */

export interface ExpenseRow {
  expenseId: number;
  details?: string;
  expenseDate?: string;
  amount: number;
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
  totalEarned: number;
  totalPaid: number;
  /** Earned minus paid; negative means the teacher has been overpaid. */
  pending: number;
  earnings: TeacherEarningRow[];
  payments: TeacherPaymentRow[];
  generatedOn: string;
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
}
