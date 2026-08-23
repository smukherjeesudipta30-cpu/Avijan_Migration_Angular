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
}
