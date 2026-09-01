export interface TeacherListItem {
  id: number;
  name?: string;
  loginId?: string;
  phone?: string;
  activeStudents: number;
  totalStudents: number;
  totalEarnings: number;
  lastPaidOn?: string;
  /** Stand-in row created for a teacher deleted from the legacy system. */
  isPlaceholder: boolean;
  /** True when students or payouts still point here, so it cannot be deleted. */
  isReferenced: boolean;
}

export interface TeacherSaveRequest {
  name: string;
  loginId: string;
  phone: string | null;
}

export interface TeacherEarning {
  id: number;
  paidOn?: string;
  billNo?: string;
  studentName?: string;
  registrationId?: string;
  courseName?: string;
  amount: number;
}

export interface BranchListItem {
  id: number;
  name?: string;
  /** Short code that becomes part of registration ids — Rajpur gives AVI/Raj/… */
  code?: string;
  isActive: boolean;
  studentCount: number;
  /** Registration ids already issued under this code; once above zero the code is frozen. */
  issuedRegistrations: number;
}

export interface BranchSaveRequest {
  name: string;
  code: string;
  isActive: boolean;
}

/* ============================================= payments made to a teacher */

export interface TeacherPaymentRequest {
  teacherId: number;
  paidOn: string | null;
  amount: number;
}

/** One payment handed to a teacher. */
export interface TeacherPayment {
  id: number;
  paidOn?: string;
  amount: number;
  recordedBy?: string;
  recordedOn: string;
}

/** A teacher's account: earned from fees, paid out, and the balance. */
export interface TeacherAccount {
  teacherId: number;
  teacherName?: string;
  totalEarned: number;
  totalPaid: number;
  /** Earned minus paid; negative means the teacher has been overpaid. */
  pending: number;

  /** The range these figures cover. Absent means all time. */
  from?: string;
  to?: string;

  /** True when a date filter is applied. */
  isFiltered: boolean;
}
