export interface StudentListItem {
  id: number;
  name?: string;
  guardianName?: string;
  registrationId?: string;
  billNo?: string;
  phone?: string;
  email?: string;
  address?: string;
  courseId?: number;
  courseName?: string;
  courseDuration?: number;
  teacherCount?: number;
  primaryTeacherId?: number;
  primaryTeacherName?: string;
  secondTeacherId?: number;
  secondTeacherName?: string;
  thirdTeacherId?: number;
  thirdTeacherName?: string;
  admissionFees?: number;
  admissionPaymentMode?: 'Cash' | 'Bank';
  /** How much of the admission fee has actually come in. */
  admissionFeesPaid?: number;
  /** Still owed on the admission fee, floored at zero. */
  admissionDue?: number;
  monthlyFees?: number;
  dateOfJoining?: string;
  dateOfBirth?: string;
  dateOfExit?: string;
  isActive: boolean;
  isComplete: boolean;
  branchId?: number;
  branch?: string;
  hasPhoto: boolean;
  /** The student's own address, where receipts and reset codes go. */
  personalEmail?: string;
  /** Who referred the student at admission; fixed once admitted. */
  referrerType?: ReferrerType;
  referrerId?: number;
  referrerName?: string;
  referralPercent?: number;
}

export interface StudentLookup {
  id: number;
  name?: string;
  registrationId?: string;
  phone?: string;
  courseName?: string;
}

/** Create/update payload. Dates go over the wire as yyyy-MM-dd. */
export interface StudentSaveRequest {
  name: string;
  guardianName: string;
  address: string;
  phone: string;
  email: string;
  dateOfBirth: string | null;
  dateOfJoining: string | null;
  monthlyFees: number | null;
  admissionFees: number | null;
  /** What is actually being handed over now. Null means the whole fee. */
  admissionFeesPaid: number | null;
  admissionPaymentMode: 'Cash' | 'Bank';
  courseId: number | null;
  teacherCount: number | null;
  primaryTeacherId: number | null;
  secondTeacherId: number | null;
  thirdTeacherId: number | null;
  isActive: boolean;
  isComplete: boolean;
  branchId: number | null;
  /** Required when admitting; ignored on edit. */
  referrerType?: ReferrerType | null;
  referrerId?: number | null;
  personalEmail: string | null;

  /** Leave both null on create and the server generates them from the name. */
  avijanLoginEmail: string | null;
  avijanLoginPassword: string | null;
}

export interface StudentCreated {
  id: number;
  registrationId: string;
  billNo: string;
}

export interface NextRegistration {
  registrationId: string;
  billNo: string;
}

export interface AdmissionReceipt {
  id: number;
  name?: string;
  registrationId?: string;
  billNo?: string;
  courseName?: string;
  admissionFees?: number;
  admissionFeesInWords: string;
  dateOfJoining?: string;
  nextDueDate?: string;
  /** Absolute URL of the PDF, sent as a link in the WhatsApp message. */
  pdfUrl?: string;
}

export interface CourseLookup {
  courseId: number;
  name: string;
  duration?: number;
}

export interface TeacherLookup {
  teacherId: number;
  name: string;
  loginId?: string;
  /** Stand-in row for a teacher deleted from the legacy system. */
  isPlaceholder: boolean;
}

export interface BranchLookup {
  branchId: number;
  name: string;
  /** Short form used in the registration id — Rajpur → "Raj". */
  code?: string;
}

export interface StudentPhoto {
  fileId: number;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface StudentQuery {
  page?: number;
  pageSize?: number;
  isActive?: boolean | null;
  courseId?: number | null;
  registrationId?: string | null;
  name?: string | null;
  search?: string | null;
}

/** The portal sign-in that will be issued for a student name. */
export interface SuggestedLogin {
  email: string;
  password: string;
}

/* ============================================ admission fee, part payment */

/** One receipt taken against a student's admission fee. */
export interface AdmissionFeeReceipt {
  id: number;
  amount: number;
  paymentMode?: 'Cash' | 'Bank';
  paidOn: string;
  /** True for the money taken at admission itself, false for a later instalment. */
  isAtAdmission: boolean;
  note?: string;
  createdBy?: string;
}

/** Where a student stands on their admission fee. */
export interface AdmissionDue {
  studentId: number;
  registrationId?: string;
  studentName?: string;
  admissionFees: number;
  admissionFeesPaid: number;
  admissionDue: number;
  receipts: AdmissionFeeReceipt[];
}

/** An instalment being taken against an outstanding admission fee. */
export interface AdmissionDueCollectRequest {
  amount: number;
  paymentMode: 'Cash' | 'Bank';
  paidOn: string | null;
  note: string | null;
}

export type ReferrerType = 'Teacher' | 'Receptionist';
