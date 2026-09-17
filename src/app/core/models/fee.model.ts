export interface StudentFeeBill {
  studentId: number;
  registrationId: string;
  studentName?: string;
  courseName?: string;
  courseDuration?: number;
  admissionFees?: number;
  monthlyFees?: number;
  dateOfJoining?: string;
  teacherCount?: number;
  primaryTeacherId?: number;
  primaryTeacherName?: string;
  secondTeacherId?: number;
  secondTeacherName?: string;
  thirdTeacherId?: number;
  thirdTeacherName?: string;
  /** Installments already recorded — the legacy "Payment done already ... Month". */
  installmentsPaid: number;
  lastPaymentDate?: string;
  outstandingDue: number;

  /** The student's mobile number, for sending the receipt on WhatsApp. */
  phone?: string;

  /** Where the receipt will be emailed. Blank means it cannot be sent. */
  personalEmail?: string;

  /**
   * Still owed on the admission fee — separate from `outstandingDue`, which is
   * monthly fees only. Lets the counter settle it in the same visit.
   */
  admissionDue?: number;
}

export interface FeePayment {
  id: number;
  registrationId?: string;
  studentName?: string;
  courseName?: string;
  billNo?: string;
  feeDate?: string;
  previousPaymentDate?: string;
  installment?: number;
  amountPaid?: number;
  percentage?: number;
  oldDue?: number;
  newDue?: number;
  lateFine?: number;
  paymentMode?: 'Cash' | 'Bank';
}

export interface FeeCalculationRequest {
  registrationId: string;
  feeDate: string;
  installmentAmount: number;
  amountPaid: number | null;
}

export interface FeeCalculation {
  daysSincePrevious: number;
  daysPerInstallment: number;
  lateFine: number;
  totalForMonth: number;
  oldDue: number;
  newDue: number;
  referenceDate?: string;

  /** Days since the student's previous payment. Shown at the counter; not what the fine uses. */
  daysSinceLastPayment?: number;
  lastPaymentDate?: string;
  /** Plain-English breakdown of how the fine was reached. */
  explanation: string;
}

export interface FeeSaveRequest {
  registrationId: string;
  feeDate: string;
  previousPaymentDate: string | null;
  installmentAmount: number;
  teacherPercentage: number;
  lateFine: number;
  totalForMonth: number;
  amountPaid: number;
  oldDue: number;
  newDue: number;
  /** 'Cash' or 'Bank' — how the money was actually received at the counter. */
  paymentMode: 'Cash' | 'Bank';
}

export interface FeeRecorded {
  id: number;
  billNo: string;
  teacherSalaryEach: number;
}

export interface FeeReceipt {
  id: number;
  studentName?: string;
  registrationId?: string;
  courseName?: string;
  billNo?: string;
  amountPaid?: number;
  amountPaidInWords: string;
  oldDue?: number;
  newDue?: number;
  feeDate?: string;
  nextDueDate?: string;
  /** Absolute URL of the PDF, sent as a link in the WhatsApp message. */
  pdfUrl?: string;
}

/* ======================================= online payment from the portal */

/** What the signed-in student owes for their next unpaid month. */
export interface MyFeeDue {
  registrationId: string;
  studentName?: string;
  courseName?: string;

  /** The date the payment is being made — today, as at the counter. */
  feeDate: string;

  /** When this month's fee fell due. Absent for a student with no payment history. */
  dueDate?: string;

  monthlyFee: number;
  lateFine: number;
  /** Monthly fee plus the fine — the amount to transfer. */
  amountPayable: number;

  oldDue: number;
  fineExplanation?: string;
  previousPaymentDate?: string;

  /** False when there is nothing to pay; `reason` says why. */
  canPay: boolean;
  reason?: string;

  upiId?: string;
  payeeName?: string;
}

/** One online payment awaiting the office's confirmation. */
export interface OnlinePaymentNotice {
  feeId: number;
  billNo?: string;
  registrationId?: string;
  studentName?: string;
  courseName?: string;
  /** The month paid for. */
  feeDate?: string;
  monthlyFee: number;
  lateFine: number;
  amountPaid: number;
  transactionId?: string;
  /** When the student submitted it. */
  paidOn: string;
}
