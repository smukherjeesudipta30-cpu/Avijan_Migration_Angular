import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { FeeReceipt } from '../models/fee.model';
import {
  AdmissionsReport,
  BranchGrouping,
  BranchReport,
  DuesReport,
  FeeCollectionsReport,
  PendingPaymentsReport,
  PayrollSettings,
  ExpenseReport,
  StudentCertificate,
  StudentStatement,
  StudentsByTeacherReport,
  TeacherEarningsReport
} from '../models/report.model';

/**
 * The six operational reports. Every one of them used to be its own controller
 * building SQL from concatenated strings; they are one endpoint group now.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/reports`;

  private params(values: Record<string, unknown>): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }

  admissions(
    from: string,
    to: string,
    page = 1,
    pageSize = 25,
    courseId?: number | null,
    branch?: string | null
  ): Observable<AdmissionsReport> {
    return this.http
      .get<ApiResponse<AdmissionsReport>>(`${this.base}/admissions`, {
        params: this.params({ from, to, page, pageSize, courseId, branch })
      })
      .pipe(map(r => r.data));
  }

  dues(
    courseId: number,
    from: string,
    to: string,
    page = 1,
    pageSize = 25,
    includeNeverPaid = true,
    branch?: string | null
  ): Observable<DuesReport> {
    return this.http
      .get<ApiResponse<DuesReport>>(`${this.base}/dues`, {
        params: this.params({ courseId, from, to, page, pageSize, includeNeverPaid, branch })
      })
      .pipe(map(r => r.data));
  }

  /** Branch-wise arrears, in two sections. Not paged — it covers active students only. */
  pendingPayments(
    from: string,
    to: string,
    branch?: string | null,
    courseId = 0
  ): Observable<PendingPaymentsReport> {
    return this.http
      .get<ApiResponse<PendingPaymentsReport>>(`${this.base}/pending-payments`, {
        params: this.params({ from, to, branch, courseId })
      })
      .pipe(map(r => r.data));
  }

  /** Every fee payment in a range, cash versus bank, who collected it, branch-wise. */
  feeCollections(
    from: string,
    to: string,
    branch?: string | null,
    paymentMode?: string | null,
    kind?: string | null
  ): Observable<FeeCollectionsReport> {
    return this.http
      .get<ApiResponse<FeeCollectionsReport>>(`${this.base}/fee-collections`, {
        params: this.params({ from, to, branch, paymentMode, kind })
      })
      .pipe(map(r => r.data));
  }

  expenses(
    from: string,
    to: string,
    page = 1,
    pageSize = 25,
    search?: string | null,
    branch?: string | null
  ): Observable<ExpenseReport> {
    return this.http
      .get<ApiResponse<ExpenseReport>>(`${this.base}/expenses`, {
        params: this.params({ from, to, page, pageSize, search, branch })
      })
      .pipe(map(r => r.data));
  }

  teacherEarnings(teacherId: number, from: string, to: string): Observable<TeacherEarningsReport> {
    return this.http
      .get<ApiResponse<TeacherEarningsReport>>(`${this.base}/teacher-earnings`, {
        params: this.params({ teacherId, from, to })
      })
      .pipe(map(r => r.data));
  }

  /** Whether the missed-scan-out deduction is currently switched on — the admin's own call. */
  payrollSettings(): Observable<PayrollSettings> {
    return this.http
      .get<ApiResponse<PayrollSettings>>(`${this.base}/payroll-settings`)
      .pipe(map(r => r.data));
  }

  /** Admin only. */
  updatePayrollSettings(missedScanOutDeductionEnabled: boolean): Observable<ApiResponse<PayrollSettings>> {
    return this.http.put<ApiResponse<PayrollSettings>>(
      `${this.base}/payroll-settings`, { missedScanOutDeductionEnabled });
  }

  studentsByTeacher(
    teacherId: number,
    page = 1,
    pageSize = 25,
    activeOnly = true,
    search?: string | null
  ): Observable<StudentsByTeacherReport> {
    return this.http
      .get<ApiResponse<StudentsByTeacherReport>>(`${this.base}/students-by-teacher`, {
        params: this.params({ teacherId, page, pageSize, activeOnly, search })
      })
      .pipe(map(r => r.data));
  }

  /**
   * The signed-in student's own statement. Student role only, as the legacy
   * `StudentReport/Index` was — the registration id is resolved server-side from
   * the sign-in, so there is nothing to pass and nothing to tamper with.
   */
  studentStatement(): Observable<StudentStatement> {
    return this.http
      .get<ApiResponse<StudentStatement>>(`${this.base}/student-statement`)
      .pipe(map(r => r.data));
  }

  /** The signed-in student's completion certificate. */
  /**
   * Issues the student's certificate and records the copy.
   *
   * POST, not GET: the first call returns the original and every call after it
   * returns the next numbered duplicate, so this must not be something a refresh
   * or a cache can repeat on its own.
   */
  issueMyCertificate(): Observable<StudentCertificate> {
    return this.http
      .post<ApiResponse<StudentCertificate>>(`${this.base}/my-certificate`, {})
      .pipe(map(r => r.data));
  }

  /** Money receipt for one of the signed-in student's own payments. */
  myReceipt(feeId: number): Observable<FeeReceipt> {
    return this.http
      .get<ApiResponse<FeeReceipt>>(`${this.base}/my-receipt`, {
        params: this.params({ feeId })
      })
      .pipe(map(r => r.data));
  }

  /** The signed-in teacher's own teacher id, for the self-scoped account report. */
  myTeacherId(): Observable<number> {
    return this.http
      .get<ApiResponse<number>>(`${this.base}/my-teacher-id`)
      .pipe(map(r => r.data));
  }

  myRegistrationId(): Observable<string> {
    return this.http
      .get<ApiResponse<string>>(`${this.base}/my-registration-id`)
      .pipe(map(r => r.data));
  }

  /** Admissions, payments and expenses by branch, bucketed by month/quarter/year. */
  branchReport(
    from: string,
    to: string,
    groupBy: BranchGrouping,
    branch?: string | null
  ): Observable<BranchReport> {
    let params = new HttpParams()
      .set('from', from)
      .set('to', to)
      .set('groupBy', groupBy);

    if (branch) params = params.set('branch', branch);

    return this.http
      .get<ApiResponse<BranchReport>>(`${this.base}/branch`, { params })
      .pipe(map(r => r.data));
  }
}
