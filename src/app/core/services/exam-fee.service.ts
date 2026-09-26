import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { ExamFeeDueRow, ExamFeePaymentRow, ExamFeeRate, StudentExamFee } from '../models/exam-fee.model';

/** Exam fees: the per course/branch master, collecting, and the student's own view. */
@Injectable({ providedIn: 'root' })
export class ExamFeeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/exam-fees`;

  rates(): Observable<ExamFeeRate[]> {
    return this.http.get<ApiResponse<ExamFeeRate[]>>(`${this.base}/rates`).pipe(map(r => r.data));
  }

  saveRates(rates: ExamFeeRate[]): Observable<ApiResponse<ExamFeeRate[]>> {
    return this.http.put<ApiResponse<ExamFeeRate[]>>(`${this.base}/rates`, { rates });
  }

  student(studentId: number): Observable<StudentExamFee> {
    return this.http.get<ApiResponse<StudentExamFee>>(`${this.base}/students/${studentId}`).pipe(map(r => r.data));
  }

  collect(
    studentId: number,
    body: { amount: number; paymentMode: 'Cash' | 'Bank'; paidOn?: string | null; note?: string | null }
  ): Observable<ApiResponse<StudentExamFee>> {
    return this.http.post<ApiResponse<StudentExamFee>>(`${this.base}/students/${studentId}/collect`, body);
  }

  setOverride(studentId: number, amount: number | null): Observable<ApiResponse<StudentExamFee>> {
    return this.http.put<ApiResponse<StudentExamFee>>(`${this.base}/students/${studentId}/override`, { amount });
  }

  deletePayment(paymentId: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/payments/${paymentId}`);
  }

  /** Moves an exam fee typed into Other income onto a student's exam fee. */
  moveFromOtherIncome(otherIncomeId: number, studentId: number): Observable<ApiResponse<StudentExamFee>> {
    return this.http.post<ApiResponse<StudentExamFee>>(`${this.base}/move-from-other-income`, { otherIncomeId, studentId });
  }

  /** Exam fees received in a range, optionally for one branch, course or registration id. */
  payments(f: { from: string; to: string; branch?: string | null; courseId?: number | null; registrationId?: string | null }):
    Observable<ExamFeePaymentRow[]> {
    let params = new HttpParams().set('from', f.from).set('to', f.to);
    if (f.branch) params = params.set('branch', f.branch);
    if (f.courseId) params = params.set('courseId', f.courseId);
    if (f.registrationId?.trim()) params = params.set('registrationId', f.registrationId.trim());
    return this.http.get<ApiResponse<ExamFeePaymentRow[]>>(`${this.base}/payments`, { params }).pipe(map(r => r.data));
  }

  dues(branch?: string | null): Observable<ExamFeeDueRow[]> {
    let params = new HttpParams();
    if (branch) params = params.set('branch', branch);
    return this.http.get<ApiResponse<ExamFeeDueRow[]>>(`${this.base}/dues`, { params }).pipe(map(r => r.data));
  }

  /** The signed-in student's own exam fee. */
  mine(): Observable<StudentExamFee> {
    return this.http
      .get<ApiResponse<StudentExamFee>>(`${environment.apiBaseUrl}/my-exam-fee`)
      .pipe(map(r => r.data));
  }
}
