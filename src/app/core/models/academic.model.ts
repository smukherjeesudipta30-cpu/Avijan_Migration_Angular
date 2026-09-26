export interface CourseListItem {
  courseId: number;
  name?: string;
  /** Course length in months. */
  duration?: number;
  activeStudents: number;
  totalStudents: number;
  /** True when students are enrolled, so the course cannot be deleted. */
  isReferenced: boolean;
}

export interface CourseSaveRequest {
  name: string;
  duration: number | null;
}

export interface CourseProgress {
  studentId: number;
  studentName?: string;
  registrationId?: string;
  phone?: string;
  email?: string;
  dateOfJoining?: string;
  courseName?: string;
  totalMonths: number;
  /** Months paid for — counted from the fee ledger, not months elapsed. */
  paidMonths: number;
  remainingMonths: number;
  percentComplete: number;
}

export interface MarkSubject {
  subject?: string;
  fullMarks?: number;
  obtainedMarks?: number;
}

export interface MarkListItem {
  id: number;
  registrationId?: string;
  studentName?: string;
  courseName?: string;
  examDate?: string;
  subjects: MarkSubject[];
  totalFullMarks: number;
  totalObtainedMarks: number;
  percentScored: number;
  /** "Register" (typed on this screen) or "ExamPortal" (read-only here; managed on the Exams screen). */
  source?: 'Register' | 'ExamPortal';
}

export interface MarkSaveRequest {
  registrationId: string;
  examDate: string | null;

  subject1: string | null;
  fullMarks1: number | null;
  obtainedMarks1: number | null;

  subject2: string | null;
  fullMarks2: number | null;
  obtainedMarks2: number | null;

  subject3: string | null;
  fullMarks3: number | null;
  obtainedMarks3: number | null;

  subject4: string | null;
  fullMarks4: number | null;
  obtainedMarks4: number | null;
}

export interface NoticeListItem {
  id: number;
  text?: string;
  noticeDate?: string;
}

export interface NoticeSaveRequest {
  text: string;
  /** Omit to keep the existing date on update, or stamp now on create. */
  noticeDate: string | null;
}
