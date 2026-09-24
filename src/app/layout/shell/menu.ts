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

export interface MenuSection {
  title: string;
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
      { label: 'Expenses', icon: 'pi pi-minus-circle', route: '/expenses', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Other Income', icon: 'pi pi-plus-circle', route: '/other-income', roles: ['Admin', 'Editor', 'Receptionist'] },
      // The legacy Income/Index was [Authorize(Roles = "Admin")] only.
      { label: 'Income', icon: 'pi pi-chart-line', route: '/income', roles: ['Admin'] },
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
      { label: 'Competition Entries', icon: 'pi pi-palette', route: '/reports/competition', roles: ['Admin', 'Editor', 'Receptionist'], feature: 'competition' },
      { label: 'Expense Report', icon: 'pi pi-minus-circle', route: '/reports/expenses', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Teacher Account', icon: 'pi pi-briefcase', route: '/reports/teacher-earnings', roles: ['Admin', 'Editor', 'Receptionist', 'Teacher'] },
      { label: 'Students by Teacher', icon: 'pi pi-sitemap', route: '/reports/students-by-teacher', roles: ['Admin', 'Editor', 'Teacher'] },
      { label: 'Staff Attendance', icon: 'pi pi-clock', route: '/reports/attendance', roles: ['Admin', 'Editor'], feature: 'attendance' },
      // Students see their own; staff can look up anyone's.
      { label: 'My Statement', icon: 'pi pi-receipt', route: '/reports/student-statement', roles: ['Student'] }
    ]
  }
];
