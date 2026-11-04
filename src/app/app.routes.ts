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
    /* Public check behind the QR code printed on every certificate. */
    path: 'verify/:code',
    title: 'Certificate verification · Avijan',
    loadComponent: () =>
      import('./features/certificate-verify/certificate-verify.component').then(m => m.CertificateVerifyComponent)
  },
  {
    /* Public careers page: Receptionist vacancies and the Apply pop-up. Outside
       the shell and the sign-in — it is the page shared on Facebook and Instagram. */
    path: 'careers',
    title: 'Careers at Avijan',
    loadComponent: () =>
      import('./features/careers/careers-page.component').then(m => m.CareersPageComponent)
  },
  {
    /* The privacy policy. Public: Google Play links to it from the store listing. */
    path: 'privacy',
    title: 'Privacy Policy · Avijan',
    loadComponent: () =>
      import('./features/privacy/privacy-page.component').then(m => m.PrivacyPageComponent)
  },
  {
    /* How to ask for account deletion. Public: the Play Data safety form links to it. */
    path: 'delete-account',
    title: 'Delete your account · Avijan',
    loadComponent: () =>
      import('./features/privacy/delete-account-page.component').then(m => m.DeleteAccountPageComponent)
  },
  {
    /* The public competition portal. Outside the shell and outside the sign-in:
       entrants are children from any school with no account here, and the owner
       asked for it to be reachable straight from the landing page. */
    path: 'competition',
    title: 'Drawing & Dance Competition - Avijan',
    loadComponent: () =>
      import('./features/competition/competition-portal.component')
        .then(m => m.CompetitionPortalComponent)
  },
  {
    path: 'login',
    title: 'Sign in · Avijan',
    loadComponent: () =>
      import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    // Anonymous by design: this is exactly for someone who cannot sign in.
    path: 'forgot-password',
    title: 'Forgot password · Avijan',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component')
        .then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    title: 'Reset password · Avijan',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.component')
        .then(m => m.ResetPasswordComponent)
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
    /* The page the attendance QR opens on a phone. Outside the shell on purpose:
       it is opened by a camera at the door, and a sidebar full of links is not
       what anyone needs while standing there. Signing in is still required — the
       authGuard on it sends them to login and back. */
    path: 'attendance/scan',
    title: 'Mark attendance · Avijan',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/attendance/scan/attendance-scan.component')
        .then(m => m.AttendanceScanComponent)
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
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/users/users.component').then(m => m.UsersComponent)
      },
      {
        // Taking the monthly fee at the counter is the receptionist's job.
        path: 'fees',
        title: 'Monthly course fees · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
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
        // The administrator's side of the examination portal. Receptionist is
        // included too, but only to put a Practical date on a student once
        // Theory is done — the component itself hides everything else from them.
        path: 'exams',
        title: 'Exam papers · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
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
        // Admin's side: assign a teacher to a course, schedule the sitting,
        // AI generates it. Editor may use it, same as the rest of Academics.
        path: 'teacher-exams',
        title: 'Teacher Exams · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/teacher-exams/teacher-exams.component')
            .then(m => m.TeacherExamsComponent)
      },
      {
        // The teacher's own side. Teacher role only, as their earnings report is.
        path: 'my-teacher-exam',
        title: 'My Competency Exam · Avijan',
        canActivate: [roleGuard('Teacher')],
        loadComponent: () =>
          import('./features/my-teacher-exam/my-teacher-exam.component')
            .then(m => m.MyTeacherExamComponent)
      },
      {
        path: 'my-teacher-exam/:scheduleId/sit',
        title: 'Competency Exam · Avijan',
        canActivate: [roleGuard('Teacher')],
        loadComponent: () =>
          import('./features/my-teacher-exam/exam-sitting/teacher-exam-sitting.component')
            .then(m => m.TeacherExamSittingComponent)
      },
      {
        /* Attendance. The staff page carries the QR to display at the centre and
           the person's own day; the rota is the administrator's master form. */
        path: 'attendance',
        title: 'Attendance · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist', 'Teacher')],
        loadComponent: () =>
          import('./features/attendance/attendance.component')
            .then(m => m.AttendanceComponent)
      },
      {
        path: 'attendance/rota',
        title: 'Staff rota · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/attendance/rota/attendance-rota.component')
            .then(m => m.AttendanceRotaComponent)
      },
      {
        /* The staff hierarchy. Everybody signed in may look at it -- a student
           should be able to see who runs the centre and who teaches them -- while
           building it stays with the back office. */
        path: 'team',
        title: 'Institute Hierarchy · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Student', 'Teacher', 'Receptionist')],
        loadComponent: () =>
          import('./features/org/org-chart-page.component')
            .then(m => m.OrgChartPageComponent)
      },
      {
        path: 'team/manage',
        title: 'Staff hierarchy · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/org/org-manage.component')
            .then(m => m.OrgManageComponent)
      },
      {
        path: 'reports/attendance',
        title: 'Staff attendance · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/reports/attendance/attendance-report.component')
            .then(m => m.AttendanceReportComponent)
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
        path: 'holidays',
        title: 'Holiday list · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist', 'Teacher', 'Student')],
        loadComponent: () =>
          import('./features/holidays/holidays.component')
            .then(m => m.HolidaysComponent)
      },
      {
        path: 'birthdays',
        title: 'Birthdays · Avijan',
        canActivate: [roleGuard('Admin')],
        loadComponent: () =>
          import('./features/birthdays/birthdays.component')
            .then(m => m.BirthdaysComponent)
      },
      {
        path: 'certificate-settings',
        title: 'Certificate signature · Avijan',
        canActivate: [roleGuard('Admin')],
        loadComponent: () =>
          import('./features/certificate-settings/certificate-settings.component')
            .then(m => m.CertificateSettingsComponent)
      },
      {
        path: 'offer-settings',
        title: 'Admission offer · Avijan',
        canActivate: [roleGuard('Admin', 'Receptionist')],
        loadComponent: () =>
          import('./features/offer-settings/offer-settings.component')
            .then(m => m.OfferSettingsComponent)
      },
      {
        path: 'site-visits',
        title: 'Website visitors · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/site-visits/site-visits.component')
            .then(m => m.SiteVisitsComponent)
      },
      {
        path: 'careers-admin',
        title: 'Careers · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/careers/careers-admin.component')
            .then(m => m.CareersAdminComponent)
      },
      {
        path: 'bank-statement',
        title: 'Bank statement · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/bank-statement/bank-statement.component')
            .then(m => m.BankStatementComponent)
      },
      {
        path: 'proprietor-honorarium',
        title: 'Proprietor honorarium · Avijan',
        canActivate: [roleGuard('Admin', 'Editor')],
        loadComponent: () =>
          import('./features/proprietor-honorarium/proprietor-honorarium.component')
            .then(m => m.ProprietorHonorariumComponent)
      },
      {
        path: 'exam-fees',
        title: 'Exam fees · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/exam-fees/exam-fees.component')
            .then(m => m.ExamFeesComponent)
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
        // The receptionist chases the unpaid fees, so they need the list.
        path: 'reports/dues',
        title: 'Outstanding dues · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/reports/dues/dues-report.component')
            .then(m => m.DuesReportComponent)
      },
      {
        /* Branch-wise arrears in two sections. Admin and the front desk only, at
           the owner's instruction — it names every student's outstanding balance. */
        path: 'reports/pending-payments',
        title: 'Pending payments · Avijan',
        canActivate: [roleGuard('Admin', 'Receptionist')],
        loadComponent: () =>
          import('./features/reports/pending-payments/pending-payments-report.component')
            .then(m => m.PendingPaymentsReportComponent)
      },
      {
        /* Several teachers' earnings at once, with a PDF. Admin and the front desk
           only - it lists colleagues' pay, so no Teacher version. */
        path: 'reports/teachers-earnings',
        title: 'Teacher earnings · Avijan',
        canActivate: [roleGuard('Admin', 'Receptionist')],
        loadComponent: () =>
          import('./features/reports/teachers-earnings/teachers-earnings-report.component')
            .then(m => m.TeachersEarningsReportComponent)
      },
      {
        /* Cash-versus-bank and who collected it, branch-wise. Admin and the front
           desk only, the same rule as pending-payments — this names who collected
           what. */
        path: 'reports/exam-fee-receipts',
        title: 'Exam fee receipts · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/reports/exam-fee-payments/exam-fee-payments-report.component')
            .then(m => m.ExamFeePaymentsReportComponent)
      },
      {
        path: 'reports/fee-collections',
        title: 'Fee collections · Avijan',
        canActivate: [roleGuard('Admin', 'Receptionist')],
        loadComponent: () =>
          import('./features/reports/fee-collections/fee-collections-report.component')
            .then(m => m.FeeCollectionsReportComponent)
      },
      {
        /* The competition register. Editor is here on purpose: it is the role the
           owner asked to be given to Arkita Nath for the programme section. */
        path: 'reports/competition',
        title: 'Competition registrations - Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/reports/competition/competition-report.component')
            .then(m => m.CompetitionReportComponent)
      },
      {
        path: 'competition/setup',
        title: 'Competition setup - Avijan',
        canActivate: [roleGuard('Admin')],
        loadComponent: () =>
          import('./features/competition/competition-admin.component')
            .then(m => m.CompetitionAdminComponent)
      },
      {
        path: 'reports/expenses',
        title: 'Expense report · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/reports/expenses/expenses-report.component')
            .then(m => m.ExpensesReportComponent)
      },
      {
        path: 'reports/teacher-earnings',
        title: 'Teacher account · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist', 'Teacher')],
        loadComponent: () =>
          import('./features/reports/teacher-earnings/teacher-earnings-report.component')
            .then(m => m.TeacherEarningsReportComponent)
      },
      {
        path: 'reports/students-by-teacher',
        title: 'Students by teacher · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Teacher')],
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
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/expenses/expenses.component').then(m => m.ExpensesComponent)
      },
      {
        path: 'other-income',
        title: 'Other income · Avijan',
        canActivate: [roleGuard('Admin', 'Editor', 'Receptionist')],
        loadComponent: () =>
          import('./features/other-income/other-income.component')
            .then(m => m.OtherIncomeComponent)
      },
      {
        path: 'income',
        title: 'Income report · Avijan',
        // Receptionist validates the report; the server names the proprietor's line neutrally for them.
        canActivate: [roleGuard('Admin', 'Receptionist')],
        loadComponent: () =>
          import('./features/income/income.component').then(m => m.IncomeComponent)
      },
      // Reaching the shell with no child sends staff to their dashboard.
      /* Avijan PreSchool. Guarded for its own roles only, so no Computer
         Centre role reaches these pages (SuperAdmin passes every guard). */
      {
        path: 'preschool/dashboard',
        title: 'PreSchool · Avijan',
        canActivate: [roleGuard('PreSchoolHead', 'PreSchoolFrontDesk', 'PreSchoolTutor')],
        loadComponent: () =>
          import('./features/preschool/dashboard/preschool-dashboard.component')
            .then(m => m.PreSchoolDashboardComponent)
      },
      {
        path: 'preschool/classes',
        title: 'PreSchool classes & fees · Avijan',
        canActivate: [roleGuard('PreSchoolHead', 'PreSchoolFrontDesk', 'PreSchoolTutor')],
        loadComponent: () =>
          import('./features/preschool/classes/preschool-classes.component')
            .then(m => m.PreSchoolClassesComponent)
      },
      {
        path: 'preschool/settings',
        title: 'PreSchool settings · Avijan',
        canActivate: [roleGuard('PreSchoolHead')],
        loadComponent: () =>
          import('./features/preschool/settings/preschool-settings.component')
            .then(m => m.PreSchoolSettingsComponent)
      },
      {
        path: 'preschool/parent',
        title: 'My child · Avijan PreSchool',
        canActivate: [roleGuard('Parent')],
        loadComponent: () =>
          import('./features/preschool/parent/preschool-parent.component')
            .then(m => m.PreSchoolParentComponent)
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: '' }
];
