import { Routes } from '@angular/router';

import { authGuard, roleGuard } from './core/guards/auth.guard';

/**
 * One lazy chunk per feature (MIGRATION_PLAN §6). Only the three migrated pages
 * are wired up so far — the remaining routes from the plan slot in beside them.
 */
export const routes: Routes = [
  {
    path: 'about',
    title: 'About Us · Avijan',
    loadComponent: () =>
      import('./features/about/about.component').then(m => m.AboutComponent)
  },
  {
    path: 'login',
    title: 'Sign in · Avijan',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'students',
        title: 'Student registration · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/students/students.component').then(m => m.StudentsComponent)
      },
      {
        path: 'users',
        title: 'Users · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/users/users.component').then(m => m.UsersComponent)
      },
      {
        path: 'fees',
        title: 'Monthly course fees · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/fees/fees.component').then(m => m.FeesComponent)
      },
      {
        path: 'teachers',
        title: 'Teachers · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/teachers/teachers.component').then(m => m.TeachersComponent)
      },
      {
        path: 'branches',
        title: 'Branch details · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/branches/branches.component').then(m => m.BranchesComponent)
      },
      {
        path: 'courses',
        title: 'Courses · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/courses/courses.component').then(m => m.CoursesComponent)
      },
      {
        path: 'marks',
        title: 'Marks · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/marks/marks.component').then(m => m.MarksComponent)
      },
      {
        path: 'notices',
        title: 'Notices · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/notices/notices.component').then(m => m.NoticesComponent)
      },
      {
        path: 'reports/admissions',
        title: 'New admissions · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/reports/admissions/admissions-report.component')
            .then(m => m.AdmissionsReportComponent)
      },
      {
        path: 'reports/dues',
        title: 'Outstanding dues · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/reports/dues/dues-report.component')
            .then(m => m.DuesReportComponent)
      },
      {
        path: 'reports/expenses',
        title: 'Expense report · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/reports/expenses/expenses-report.component')
            .then(m => m.ExpensesReportComponent)
      },
      {
        path: 'reports/teacher-earnings',
        title: 'Teacher account · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Teacher')],
        loadComponent: () =>
          import('./features/reports/teacher-earnings/teacher-earnings-report.component')
            .then(m => m.TeacherEarningsReportComponent)
      },
      {
        path: 'reports/students-by-teacher',
        title: 'Students by teacher · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/reports/students-by-teacher/students-by-teacher-report.component')
            .then(m => m.StudentsByTeacherReportComponent)
      },
      {
        // Student role only, as the legacy StudentReport/Index was. The student is
        // resolved from their sign-in, so there is no id to pass.
        path: 'reports/student-statement',
        title: 'My statement · Avijan',
        canActivate: [roleGuard('Student')],
        loadComponent: () =>
          import('./features/reports/student-statement/student-statement.component')
            .then(m => m.StudentStatementComponent)
      },
      {
        path: 'expenses',
        title: 'Expenses · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/expenses/expenses.component').then(m => m.ExpensesComponent)
      },
      {
        path: 'income',
        title: 'Income report · Avijan',
        canActivate: [roleGuard('Admin')],
        loadComponent: () =>
          import('./features/income/income.component').then(m => m.IncomeComponent)
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: 'about' }
];
