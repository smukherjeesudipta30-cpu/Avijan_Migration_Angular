import { Routes } from '@angular/router';

import { authGuard, passwordResetGuard, roleGuard } from './core/guards/auth.guard';

/**
 * One lazy chunk per feature (MIGRATION_PLAN §6).
 *
 * The public front page is the landing route. Everything behind a sign-in lives
 * under the shell, which matches the same empty prefix — so the order matters:
 * the `pathMatch: 'full'` entry below claims `/` before the shell can.
 */
export const routes: Routes = [
  {
    // The public front page. Replaces Views/About/Index.cshtml — the site at
    // www.avijan.in — and is what an unauthenticated visitor lands on.
    path: '',
    pathMatch: 'full',
    title: 'Avijan — An Unit of Computer Professionals & Learners',
    loadComponent: () =>
      import('./features/home/home.component').then(m => m.HomeComponent)
  },
  {
    // The old URL still resolves; the front page carries the About section.
    path: 'about',
    pathMatch: 'full',
    redirectTo: ''
  },
  {
    path: 'login',
    title: 'Sign in · Avijan',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    /* The forced first-login reset. Outside the shell on purpose: the shell's
       sidebar is a set of links to pages a flagged account cannot open yet, so
       showing it would be an invitation to bounce off every guard in turn. */
    path: 'change-password',
    title: 'Choose a new password · Avijan',
    canActivate: [passwordResetGuard],
    loadComponent: () =>
      import('./features/auth/change-password/change-password.component')
        .then(m => m.ChangePasswordComponent)
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
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
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
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/teachers/teachers.component').then(m => m.TeachersComponent)
      },
      {
        path: 'branches',
        title: 'Branch details · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
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
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/marks/marks.component').then(m => m.MarksComponent)
      },
      {
        path: 'notices',
        title: 'Notices · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/notices/notices.component').then(m => m.NoticesComponent)
      },
      {
        // The administrator's side of the examination portal.
        path: 'exams',
        title: 'Exam papers · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/exams/exams.component').then(m => m.ExamsComponent)
      },
      {
        // The student's side. Student role only, as their statement is.
        path: 'my-exams',
        title: 'My exams · Avijan',
        canActivate: [roleGuard('Student')],
        loadComponent: () =>
          import('./features/my-exams/my-exams.component').then(m => m.MyExamsComponent)
      },
      {
        path: 'my-exams/:examId/sit',
        title: 'Examination · Avijan',
        canActivate: [roleGuard('Student')],
        loadComponent: () =>
          import('./features/my-exams/exam-sitting/exam-sitting.component')
            .then(m => m.ExamSittingComponent)
      },
      {
        /* The walk-in enquiry register. The receptionist takes these, so they
           reach it as well as the back office. */
        path: 'enquiries',
        title: 'Course enquiries · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/enquiries/enquiries.component').then(m => m.EnquiriesComponent)
      },
      {
        path: 'reports/enquiries',
        title: 'Enquiry follow-up · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/reports/enquiries/enquiry-report.component')
            .then(m => m.EnquiryReportComponent)
      },
      {
        path: 'receptionists',
        title: 'Receptionists · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/receptionists/receptionists.component')
            .then(m => m.ReceptionistsComponent)
      },
      {
        path: 'reports/receptionists',
        title: 'Receptionist pay · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/reports/receptionists/receptionist-report.component')
            .then(m => m.ReceptionistReportComponent)
      },
      {
        path: 'reports/branch',
        title: 'Branch performance · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/reports/branch/branch-report.component')
            .then(m => m.BranchReportComponent)
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
        // The student paying their own fee. Student role only — the ledger is
        // resolved from their sign-in, so there is no id to pass.
        path: 'my-fees',
        title: 'Pay my fees · Avijan',
        canActivate: [roleGuard('Student')],
        loadComponent: () =>
          import('./features/my-fees/my-fees.component').then(m => m.MyFeesComponent)
      },
      {
        path: 'expenses',
        title: 'Expenses · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/expenses/expenses.component').then(m => m.ExpensesComponent)
      },
      {
        path: 'other-income',
        title: 'Other income · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/other-income/other-income.component')
            .then(m => m.OtherIncomeComponent)
      },
      {
        path: 'income',
        title: 'Income report · Avijan',
        canActivate: [roleGuard('Admin')],
        loadComponent: () =>
          import('./features/income/income.component').then(m => m.IncomeComponent)
      },
      // Reaching the shell with no child sends staff to their dashboard.
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: '' }
];
