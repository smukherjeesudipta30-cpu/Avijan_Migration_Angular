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
