import { UserRole } from '../../core/models/auth.model';

export interface MenuEntry {
  label: string;
  icon: string;
  route?: string;
  roles: UserRole[];
  /** Hidden unless this optional feature is switched on server-side. */
  feature?: 'attendance' | 'org' | 'competition';
  /** Pages from MIGRATION_PLAN §6 that are not migrated yet. */
  comingSoon?: boolean;
}

/** Which school a section belongs to: Avijan Computer Centre or Avijan PreSchool. */
export type School = 'computer' | 'preschool';

export interface MenuSection {
  title: string;
  /** Computer Centre when left out. A SuperAdmin sees one school's sections at a time. */
  school?: School;
  items: MenuEntry[];
}

/**
 * Replaces the hard-coded nav in the legacy `Views/Shared/_Layout.cshtml`.
 * Entries are filtered by role at render time, so one config drives every role.
 */
export const MENU: MenuSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'pi pi-home', route: '/dashboard', roles: ['Admin', 'Editor'] },
      { label: 'Public Site', icon: 'pi pi-globe', route: '/', roles: ['Admin', 'Editor', 'Student', 'Teacher', 'Receptionist'] },
      { label: 'Holiday List', icon: 'pi pi-calendar', route: '/holidays', roles: ['Admin', 'Editor', 'Student', 'Teacher', 'Receptionist'] },
      { label: 'Attendance', icon: 'pi pi-qrcode', route: '/attendance', roles: ['Admin', 'Editor', 'Receptionist', 'Teacher'], feature: 'attendance' }
    ]
  },
  {
    title: 'People',
    items: [
      { label: 'Students', icon: 'pi pi-users', route: '/students', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Teachers', icon: 'pi pi-id-card', route: '/teachers', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Receptionists', icon: 'pi pi-user', route: '/receptionists', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Course Enquiries', icon: 'pi pi-comments', route: '/enquiries', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Branches', icon: 'pi pi-building', route: '/branches', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Users', icon: 'pi pi-user-edit', route: '/users', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Staff Rota', icon: 'pi pi-calendar', route: '/attendance/rota', roles: ['Admin', 'Editor'], feature: 'attendance' },
      { label: 'Institute Hierarchy', icon: 'pi pi-sitemap', route: '/team', roles: ['Admin', 'Editor', 'Student', 'Teacher', 'Receptionist'], feature: 'org' },
      { label: 'Competition Setup', icon: 'pi pi-palette', route: '/competition/setup', roles: ['Admin'], feature: 'competition' },
      { label: 'Staff Hierarchy', icon: 'pi pi-share-alt', route: '/team/manage', roles: ['Admin', 'Editor'], feature: 'org' }
    ]
  },
  {
    title: 'Academics',
    items: [
      { label: 'Courses', icon: 'pi pi-book', route: '/courses', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Marks', icon: 'pi pi-check-square', route: '/marks', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Notices', icon: 'pi pi-megaphone', route: '/notices', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Exam Papers', icon: 'pi pi-file-edit', route: '/exams', roles: ['Admin', 'Editor', 'Receptionist'] },
      // The student's own portal: sit a theory paper, see the course result.
      { label: 'My Exams', icon: 'pi pi-pencil', route: '/my-exams', roles: ['Student'] },
      // Assigns a teacher to a course, schedules the sitting, generates it via AI.
      { label: 'Teacher Exams', icon: 'pi pi-verified', route: '/teacher-exams', roles: ['Admin', 'Editor'] },
      // The teacher's own side: see what's due, take it, see past results.
      { label: 'My Competency Exam', icon: 'pi pi-verified', route: '/my-teacher-exam', roles: ['Teacher'] }
    ]
  },
  {
    title: 'Finance',
    items: [
      { label: 'Monthly Fees', icon: 'pi pi-wallet', route: '/fees', roles: ['Admin', 'Editor', 'Receptionist'] },
      // Exam fee per course/branch (Admin sets), and collecting it from students.
      { label: 'Exam Fees', icon: 'pi pi-file-edit', route: '/exam-fees', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Expenses', icon: 'pi pi-minus-circle', route: '/expenses', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Other Income', icon: 'pi pi-plus-circle', route: '/other-income', roles: ['Admin', 'Editor', 'Receptionist'] },
      // Admin, and Receptionist to validate it (proprietor's line named "Administrative expenses" for them).
      { label: 'Income', icon: 'pi pi-chart-line', route: '/income', roles: ['Admin', 'Receptionist'] },
      { label: 'Proprietor Honorarium', icon: 'pi pi-user', route: '/proprietor-honorarium', roles: ['Admin', 'Editor'] },
      { label: 'Bank Statement', icon: 'pi pi-building-columns', route: '/bank-statement', roles: ['Admin', 'Editor'] },
      { label: 'Careers', icon: 'pi pi-briefcase', route: '/careers-admin', roles: ['Admin', 'Editor'] },
      // The "30% OFF" ribbon on the front page: its percentage and how many days it shows.
      { label: 'Admission Offer', icon: 'pi pi-percentage', route: '/offer-settings', roles: ['Admin', 'Receptionist'] },
      { label: 'Website Visitors', icon: 'pi pi-chart-bar', route: '/site-visits', roles: ['Admin', 'Editor'] },
      { label: 'Birthdays', icon: 'pi pi-gift', route: '/birthdays', roles: ['Admin'] },
      { label: 'Certificate Signature', icon: 'pi pi-pen-to-square', route: '/certificate-settings', roles: ['Admin'] },
      // The student's own side: pay this month against the institute's QR code.
      { label: 'Pay My Fees', icon: 'pi pi-indian-rupee', route: '/my-fees', roles: ['Student'] }
    ]
  },
  {
    title: 'Reports',
    items: [
      { label: 'Enquiry Follow-up', icon: 'pi pi-phone', route: '/reports/enquiries', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Branch Performance', icon: 'pi pi-building', route: '/reports/branch', roles: ['Admin', 'Editor'] },
      { label: 'Receptionist Pay', icon: 'pi pi-user', route: '/reports/receptionists', roles: ['Admin', 'Editor'] },
      { label: 'New Admissions', icon: 'pi pi-user-plus', route: '/reports/admissions', roles: ['Admin', 'Editor'] },
      { label: 'Outstanding Dues', icon: 'pi pi-exclamation-circle', route: '/reports/dues', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Pending Payments', icon: 'pi pi-wallet', route: '/reports/pending-payments', roles: ['Admin', 'Receptionist'] },
      { label: 'Fee Collections', icon: 'pi pi-money-bill', route: '/reports/fee-collections', roles: ['Admin', 'Receptionist'] },
      { label: 'Exam Fee Receipts', icon: 'pi pi-receipt', route: '/reports/exam-fee-receipts', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Competition Entries', icon: 'pi pi-palette', route: '/reports/competition', roles: ['Admin', 'Editor', 'Receptionist'], feature: 'competition' },
      { label: 'Expense Report', icon: 'pi pi-minus-circle', route: '/reports/expenses', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Teacher Account', icon: 'pi pi-briefcase', route: '/reports/teacher-earnings', roles: ['Admin', 'Editor', 'Receptionist', 'Teacher'] },
      { label: 'Teacher Earnings (PDF/Excel)', icon: 'pi pi-file-pdf', route: '/reports/teachers-earnings', roles: ['Admin', 'Receptionist'] },
      { label: 'Students by Teacher', icon: 'pi pi-sitemap', route: '/reports/students-by-teacher', roles: ['Admin', 'Editor', 'Teacher'] },
      { label: 'Staff Attendance', icon: 'pi pi-clock', route: '/reports/attendance', roles: ['Admin', 'Editor'], feature: 'attendance' },
      // Students see their own; staff can look up anyone's.
      { label: 'My Statement', icon: 'pi pi-receipt', route: '/reports/student-statement', roles: ['Student'] }
    ]
  },
  /* Avijan PreSchool. Only its own roles are listed, so no Computer Centre user
     sees these; a SuperAdmin reaches them through the school switcher. */
  {
    title: 'PreSchool',
    school: 'preschool',
    items: [
      { label: 'Dashboard', icon: 'pi pi-home', route: '/preschool/dashboard', roles: ['PreSchoolHead', 'PreSchoolFrontDesk', 'PreSchoolTutor'] },
      { label: 'Classes & Fees', icon: 'pi pi-book', route: '/preschool/classes', roles: ['PreSchoolHead', 'PreSchoolFrontDesk', 'PreSchoolTutor'] },
      { label: 'Admission Enquiries', icon: 'pi pi-comments', route: '/preschool/enquiries', roles: ['PreSchoolHead', 'PreSchoolFrontDesk'] },
      { label: 'Holiday Notices', icon: 'pi pi-calendar', route: '/preschool/holidays', roles: ['PreSchoolHead', 'PreSchoolFrontDesk'] },
      { label: 'School Settings', icon: 'pi pi-cog', route: '/preschool/settings', roles: ['PreSchoolHead'] }
    ]
  },
  {
    title: 'My Child',
    school: 'preschool',
    items: [
      { label: 'Home', icon: 'pi pi-heart', route: '/preschool/parent', roles: ['Parent'] }
    ]
  }
];
