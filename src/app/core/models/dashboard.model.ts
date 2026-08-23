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
  generatedOn: string;
}
