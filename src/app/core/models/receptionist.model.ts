/* ==================================================== receptionist master */

export interface ReceptionistListItem {
  id: number;
  name: string;
  loginId?: string;
  phone?: string;
  /** Real mailbox for attendance codes. */
  personalEmail?: string;
  designation?: string | null;
  qualification?: string | null;
  computerTraining?: string | null;
  isTechnical: boolean;
  branch?: string;
  isActive: boolean;

  /**
   * The current standard monthly pay, set on the fees master screen — the
   * default a new month's payment starts from, not a payment itself.
   */
  monthlyPay: number;

  /** How many months have been paid, and the total. */
  paymentCount: number;
  totalPaid: number;
  lastPaidMonth?: string;
}

export interface ReceptionistMonthlyPayRequest {
  monthlyPay: number;
}

export interface ReceptionistSaveRequest {
  name: string;
  loginId: string | null;
  phone: string | null;
  personalEmail?: string | null;
  designation?: string | null;
  qualification?: string | null;
  computerTraining?: string | null;
  isTechnical: boolean;
  /** Required — the master exists for branch-wise reporting. */
  branch: string | null;
  isActive: boolean;
}

/* ================================================== receptionist payments */

export interface ReceptionistPaymentRequest {
  receptionistId: number;
  /** Any date inside the month; the server normalises it to the 1st. */
  payMonth: string;
  paidOn: string | null;
  /** The standard monthly pay — changes only when deliberately changed here. */
  amount: number;
  notes: string | null;
}

export interface ReceptionistPayment {
  id: number;
  receptionistId: number;
  receptionistName?: string;
  payMonth: string;
  paidOn?: string;
  amount: number;
  extraShiftBonus: number;
  /** Admission referral credits paid on this payment. */
  referralBonus?: number;
  branch?: string;
  notes?: string;
  recordedBy?: string;
  recordedOn: string;
}

/* ================================================= the branch-wise report */

export interface ReceptionistReportRow {
  branch: string;
  periodStart: string;
  periodLabel: string;
  receptionistId: number;
  receptionistName: string;
  amount: number;
}

export interface ReceptionistBranchTotal {
  branch: string;
  receptionists: number;
  monthsPaid: number;
  totalPaid: number;
}

export interface ReceptionistReport {
  from: string;
  to: string;
  rows: ReceptionistReportRow[];
  branchTotals: ReceptionistBranchTotal[];
  grandTotal: number;
  branches: string[];
  generatedOn: string;
}

/* ============================================== leave & salary deduction */

export type LeavePeriodType = 'Weekly' | 'Monthly' | 'Yearly' | 'Custom';

export interface ReceptionistLeaveReportLine {
  receptionistId: number;
  receptionistName: string;
  branch?: string;
  shiftsPerWeek: number;
  entitlementDays: number;
  takenDays: number;
  exceedsEntitlement: boolean;
  deductionPercent: number;
  applied: boolean;
  notes?: string;
}

export interface ReceptionistLeaveReport {
  periodType: LeavePeriodType;
  periodStart: string;
  periodEnd: string;
  rows: ReceptionistLeaveReportLine[];
  generatedOn: string;
}

export interface ReceptionistLeaveDeductionRequest {
  receptionistId: number;
  periodType: LeavePeriodType;
  /** Any date inside the period; the server normalises it to the period start. */
  periodStart: string;
  deductionPercent: number;
  applied: boolean;
  notes: string | null;
}

/* ================================================== extra-shift bonus */

export interface ExtraShiftDay {
  date: string;
  otherReceptionistName: string;
  branch?: string;
  /** Actual duration of that day's shift, from Staff Rota's shift definitions. */
  hours: number;
  /** Valued at this receptionist's own hourly rate — see {@link ExtraShiftBonus.hourlyRate}. */
  amount: number;
}

/**
 * A net transfer for one receptionist's upcoming payment — computed by the
 * server alone, never entered or edited. A day they covered a colleague adds
 * that day's actual rostered hours at their own hourly rate; a day a
 * colleague covered THEM deducts their own hours for that day, since they
 * did not work it. `netBonus` can be negative.
 */
export interface ExtraShiftBonus {
  receptionistId: number;
  hourlyRate: number;
  lastCycleHours: number;
  /** The receptionist's standard monthly pay (fees master) the hourly rate was computed from. */
  standardPay: number;
  coveredForOthersCount: number;
  coveredByOthersCount: number;
  netBonus: number;
  coveredForOthers: ExtraShiftDay[];
  coveredByOthers: ExtraShiftDay[];
}
