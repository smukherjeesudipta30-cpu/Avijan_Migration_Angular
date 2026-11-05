/** Avijan PreSchool children, fees and receipts, as PreSchoolStudentsController returns them. Dates are "yyyy-MM-dd". */

export type PreSchoolStatus = 'Active' | 'Completed' | 'Left';
export type PreSchoolPayMode = 'Cash' | 'UPI' | 'Paytm';

export interface PreSchoolStudentListItem {
  id: number;
  admissionCode: string;
  childName: string;
  classId: number;
  className: string;
  parentName: string;
  phone: string;
  joinedOn: string;
  status: PreSchoolStatus;
  monthlyFee: number;
  monthsDue: number;
  admissionDue: number;
  amountDue: number;
}

export interface PreSchoolMonth {
  month: string;
  isPaid: boolean;
  amount: number;
  receiptCode?: string | null;
}

export interface PreSchoolReceiptSummary {
  id: number;
  receiptCode: string;
  receivedOn: string;
  total: number;
  mode: PreSchoolPayMode;
  isCancelled: boolean;
  summary: string;
}

export interface PreSchoolStudentSave {
  childName: string;
  dateOfBirth: string;
  gender: string | null;
  bloodGroup: string | null;
  fatherName: string | null;
  motherName: string | null;
  parentName: string;
  phone: string;
  emergencyPhone: string | null;
  email: string | null;
  address: string | null;
  /** How the parent to contact (guardian 1) is related to the child. */
  guardianRelation: string | null;
  guardian2Name: string | null;
  guardian2Relation: string | null;
  guardian2Phone: string | null;
  heightCm: number | null;
  weightKg: number | null;
  classId: number;
  joinedOn: string;
  monthlyDiscount: number;
  status: PreSchoolStatus;
  endedOn: string | null;
  notes: string | null;
}

/** The three ID-card photos, as data URLs. */
export type PreSchoolPhotoSlot = 'Child' | 'Guardian1' | 'Guardian2';
export interface PreSchoolStudentPhotos {
  child: string | null;
  guardian1: string | null;
  guardian2: string | null;
}

export interface PreSchoolStudentDetail extends PreSchoolStudentSave {
  id: number;
  admissionCode: string;
  className: string;
  monthlyFee: number;
  admissionFee: number;
  admissionPaid: boolean;
  months: PreSchoolMonth[];
  receipts: PreSchoolReceiptSummary[];
}

export interface PreSchoolCollect {
  includeAdmission: boolean;
  admissionAmount: number | null;
  months: string[];
  mode: PreSchoolPayMode;
  reference: string | null;
  receivedOn: string | null;
  notes: string | null;
}

export interface PreSchoolReceiptLine {
  kind: 'Admission' | 'Monthly';
  forMonth?: string | null;
  description: string;
  amount: number;
}

export interface PreSchoolReceipt {
  id: number;
  receiptCode: string;
  receivedOn: string;
  mode: PreSchoolPayMode;
  reference?: string | null;
  total: number;
  totalInWords: string;
  notes?: string | null;
  isCancelled: boolean;
  receivedBy?: string | null;
  studentId: number;
  admissionCode: string;
  childName: string;
  className: string;
  parentName: string;
  phone: string;
  schoolName: string;
  schoolAddress?: string | null;
  schoolPhone?: string | null;
  lines: PreSchoolReceiptLine[];
}

export interface PreSchoolPendingRow {
  studentId: number;
  admissionCode: string;
  childName: string;
  className: string;
  parentName: string;
  phone: string;
  months: string[];
  monthlyFee: number;
  admissionDue: number;
  amount: number;
}

export interface PreSchoolPendingReport {
  rows: PreSchoolPendingRow[];
  children: number;
  months: number;
  total: number;
}

export interface PreSchoolAdmissionRow {
  studentId: number;
  admissionCode: string;
  childName: string;
  className: string;
  parentName: string;
  phone: string;
  joinedOn: string;
  status: PreSchoolStatus;
  admissionFeeReceived: number;
}

export interface PreSchoolAdmissionMonth {
  month: string;
  count: number;
  admissionFees: number;
  byClass: Record<string, number>;
  children: PreSchoolAdmissionRow[];
}

export interface PreSchoolAdmissionReport {
  year: number;
  total: number;
  admissionFees: number;
  months: PreSchoolAdmissionMonth[];
}

/** "Nov 2026" from "2026-11-01". */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/** A WhatsApp link for an Indian number; 10 digits get the 91 country code. */
export function whatsAppLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '');
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
