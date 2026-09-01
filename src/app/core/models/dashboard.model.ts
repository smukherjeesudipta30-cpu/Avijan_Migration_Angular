export interface DashboardCounts {
  activeStudents: number;
  inactiveStudents: number;
  completedStudents: number;
  courses: number;
  teachers: number;
  staffAccounts: number;
  studentAccounts: number;
  pendingEnquiries: number;
}

export interface DashboardFinance {
  feesCollectedThisMonth: number;
  lateFinesThisMonth: number;
  otherIncomeThisMonth: number;
  expensesThisMonth: number;
  /** What teachers are paid out of those fees — the biggest running cost. */
  teacherPayoutThisMonth: number;
  totalIncomeThisMonth: number;
  totalCostThisMonth: number;
  netThisMonth: number;
  outstandingDues: number;
  studentsInArrears: number;
  /** Most recent fee payment on record — the migrated ledger may predate this month. */
  lastPaymentOn?: string;
}

export interface MonthlyTrendPoint {
  year: number;
  month: number;
  label: string;
  income: number;
  expense: number;
  teacherPayout: number;
}

export interface CourseEnrolment {
  courseId: number;
  courseName: string;
  studentCount: number;
}

export interface Notice {
  id: number;
  text: string;
  noticeDate?: string;
}

export interface RecentStudent {
  id: number;
  name?: string;
  registrationId?: string;
  courseName?: string;
  dateOfJoining?: string;
}

export interface RecentPayment {
  id: number;
  studentName?: string;
  registrationId?: string;
  billNo?: string;
  amount?: number;
  paidOn?: string;
}

export interface DashboardSummary {
  counts: DashboardCounts;
  finance: DashboardFinance;
  trend: MonthlyTrendPoint[];
  courseEnrolment: CourseEnrolment[];
  recentNotices: Notice[];
  recentAdmissions: RecentStudent[];
  recentPayments: RecentPayment[];

  /** Unhandled enquiries from the public front page's contact form. */
  pendingEnquiryList?: Enquiry[];

  /** Alerts for the office — unread first, then newest. Capped by the server. */
  notifications?: AdminNotification[];

  /** Every unread alert, not only those in `notifications`. */
  unreadNotifications: number;

  generatedOn: string;
}

/** One alert for the office. */
export interface AdminNotification {
  id: number;
  /** `StudentPasswordChange` today; the field exists so more kinds can be added. */
  type: string;
  title: string;
  studentName?: string;
  courseName?: string;
  registrationId?: string;
  loginId?: string;
  /**
   * For a password change, the student's chosen password. Held behind a reveal in
   * the UI — a dashboard is a screen other people can see.
   */
  detailValue?: string;
  createdOn: string;
  isRead: boolean;
}

/** One unhandled enquiry from the public front page's "Send Us Message" form. */
export interface Enquiry {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  submittedOn: string;
}
