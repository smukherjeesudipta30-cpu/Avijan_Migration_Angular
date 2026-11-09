export interface TeacherListItem {
  id: number;
  name?: string;
  loginId?: string;
  phone?: string;
  /** Real mailbox for attendance codes; blank means they cannot mark attendance. */
  personalEmail?: string;

  /** The position, free text. A person with none does not appear on the chart. */
  designation?: string | null;

  /** Required unless isTechnical. */
  qualification?: string | null;

  /** Required unless isTechnical. */
  computerTraining?: string | null;

  /** Which branch pays this teacher's honorarium — shown on their pay slip. */
  branch?: string | null;

  /** Technical staff are excused qualification and computer training. */
  isTechnical: boolean;
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
  personalEmail?: string | null;
  designation?: string | null;
  qualification?: string | null;
  computerTraining?: string | null;
  branch?: string | null;
  isTechnical: boolean;
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

  /* Where the centre is, for staff attendance. Null means no fence is set and
     attendance cannot be taken at this branch. */
  latitude?: number;
  longitude?: number;
  geofenceMetres: number;
  /** The UPI account this branch's fees are paid into; empty for the usual one. */
  upiId?: string | null;
  upiPayeeName?: string | null;
}

export interface BranchSaveRequest {
  name: string;
  code: string;
  isActive: boolean;

  /** Taken at the centre's door. Both together, or neither. */
  latitude?: number | null;
  longitude?: number | null;
  geofenceMetres: number;
  upiId?: string | null;
  upiPayeeName?: string | null;
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
