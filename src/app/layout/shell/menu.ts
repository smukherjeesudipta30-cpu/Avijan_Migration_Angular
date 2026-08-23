import { UserRole } from '../../core/models/auth.model';

export interface MenuEntry {
  label: string;
  icon: string;
  route?: string;
  roles: UserRole[];
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
      { label: 'About Us', icon: 'pi pi-info-circle', route: '/about', roles: ['Admin', 'Editor', 'Student', 'Teacher'] }
    ]
  },
  {
    title: 'People',
    items: [
      { label: 'Students', icon: 'pi pi-users', route: '/students', roles: ['Admin', 'Editor'] },
      { label: 'Teachers', icon: 'pi pi-id-card', route: '/teachers', roles: ['Admin', 'Editor'] },
      { label: 'Branches', icon: 'pi pi-building', route: '/branches', roles: ['Admin', 'Editor'] },
      { label: 'Users', icon: 'pi pi-user-edit', route: '/users', roles: ['Admin', 'Editor'] }
    ]
  },
  {
    title: 'Academics',
    items: [
      { label: 'Courses', icon: 'pi pi-book', route: '/courses', roles: ['Admin', 'Editor', 'Receptionist'] },
      { label: 'Marks', icon: 'pi pi-check-square', route: '/marks', roles: ['Admin', 'Editor'] },
      { label: 'Notices', icon: 'pi pi-megaphone', route: '/notices', roles: ['Admin', 'Editor'] }
    ]
  },
  {
    title: 'Finance',
    items: [
      { label: 'Monthly Fees', icon: 'pi pi-wallet', route: '/fees', roles: ['Admin', 'Editor'] },
      { label: 'Expenses', icon: 'pi pi-minus-circle', route: '/expenses', roles: ['Admin', 'Editor'] },
      // The legacy Income/Index was [Authorize(Roles = "Admin")] only.
      { label: 'Income', icon: 'pi pi-chart-line', route: '/income', roles: ['Admin'] }
    ]
  },
  {
    title: 'Reports',
    items: [
      { label: 'New Admissions', icon: 'pi pi-user-plus', route: '/reports/admissions', roles: ['Admin', 'Editor'] },
      { label: 'Outstanding Dues', icon: 'pi pi-exclamation-circle', route: '/reports/dues', roles: ['Admin', 'Editor'] },
      { label: 'Expense Report', icon: 'pi pi-minus-circle', route: '/reports/expenses', roles: ['Admin', 'Editor'] },
      { label: 'Teacher Account', icon: 'pi pi-briefcase', route: '/reports/teacher-earnings', roles: ['Admin', 'Editor', 'Teacher'] },
      { label: 'Students by Teacher', icon: 'pi pi-sitemap', route: '/reports/students-by-teacher', roles: ['Admin', 'Editor'] },
      // Students see their own; staff can look up anyone's.
      { label: 'My Statement', icon: 'pi pi-receipt', route: '/reports/student-statement', roles: ['Student'] }
    ]
  }
];
