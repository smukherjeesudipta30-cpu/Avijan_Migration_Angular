/** One cell of the exam fee master: a course at a branch, and its fee (null = not set). */
export interface ExamFeeRate {
  courseId: number;
  courseName?: string;
  branch: string;
  amount: number | null;
}

export interface ExamFeePayment {
  id: number;
  paidOn: string;
  amount: number;
  paymentMode: 'Cash' | 'Bank';
  note?: string;
  recordedBy?: string;
}

/** A student's exam fee: charged, paid and owed. */
export interface StudentExamFee {
  studentId: number;
  registrationId?: string;
  studentName?: string;
  courseId?: number;
  courseName?: string;
  branch?: string;
  /** The course/branch rate; null when Admin has not set one. */
  standardFee?: number | null;
  /** This student's own amount, when Admin has set one. */
  overrideFee?: number | null;
  /** What the student is charged: override if set, else the standard fee. */
  examFee?: number | null;
  paid: number;
  due: number;
  examScheduled: boolean;
  payments: ExamFeePayment[];
}

/** A student scheduled for an exam who still owes exam fee. */
/** One exam fee received (the exam fee receipts report). */
export interface ExamFeePaymentRow {
  id: number;
  paidOn: string;
  studentId: number;
  registrationId?: string;
  studentName?: string;
  branch?: string;
  courseId?: number | null;
  courseName?: string;
  amount: number;
  paymentMode: string;
  receivedBy?: string;
  note?: string;
}

export interface ExamFeeDueRow {
  studentId: number;
  registrationId?: string;
  studentName?: string;
  phone?: string;
  branch?: string;
  courseName?: string;
  examFee: number;
  paid: number;
  due: number;
}
