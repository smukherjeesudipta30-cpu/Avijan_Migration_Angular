import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  LeavePeriodType,
  ReceptionistLeaveDeductionRequest,
  ReceptionistLeaveReport,
  ReceptionistListItem,
  ReceptionistPayment,
  ReceptionistPaymentRequest,
  ReceptionistReport,
  ReceptionistSaveRequest
} from '../models/receptionist.model';
import { PagedResult } from '../models/student.model';

/**
 * The receptionist master and their monthly pay.
 *
 * A receptionist is paid monthly rather than per fee, so a payment names the month
 * it covers — and belongs to a branch, which is what makes the report branch-wise.
 */
@Injectable({ providedIn: 'root' })
export class ReceptionistService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/receptionists`;

  private params(values: Record<string, unknown>): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }

  list(
    page = 1,
    pageSize = 25,
    search?: string | null,
    branch?: string | null,
    activeOnly = true
  ): Observable<PagedResult<ReceptionistListItem>> {
    return this.http
      .get<ApiResponse<PagedResult<ReceptionistListItem>>>(this.base, {
        params: this.params({ page, pageSize, search, branch, activeOnly })
      })
      .pipe(map(r => r.data));
  }

  create(request: ReceptionistSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.base, request);
  }

  update(id: number, request: ReceptionistSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/${id}`, request);
  }

  delete(id: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/${id}`);
  }

  /* ----------------------------------------------------------- payments */

  payments(
    receptionistId: number,
    from?: string | null,
    to?: string | null
  ): Observable<ReceptionistPayment[]> {
    return this.http
      .get<ApiResponse<ReceptionistPayment[]>>(`${this.base}/${receptionistId}/payments`, {
        params: this.params({ from, to })
      })
      .pipe(map(r => r.data));
  }

  /** Records or corrects one month's pay. Administrator only. */
  recordPayment(request: ReceptionistPaymentRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(
      `${this.base}/${request.receptionistId}/payments`, request);
  }

  deletePayment(paymentId: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/payments/${paymentId}`);
  }

  /* ------------------------------------------------------------- report */

  report(from: string, to: string, branch?: string | null): Observable<ReceptionistReport> {
    return this.http
      .get<ApiResponse<ReceptionistReport>>(`${this.base}/report`, {
        params: this.params({ from, to, branch })
      })
      .pipe(map(r => r.data));
  }

  /* ------------------------------------------------------ leave & deduction */

  leaveReport(
    periodType: LeavePeriodType,
    date: string,
    branch?: string | null,
    from?: string | null,
    to?: string | null
  ): Observable<ReceptionistLeaveReport> {
    return this.http
      .get<ApiResponse<ReceptionistLeaveReport>>(`${this.base}/leave-report`, {
        params: this.params({ periodType, date, branch, from, to })
      })
      .pipe(map(r => r.data));
  }

  /** Sets the deduction percentage/applied flag for one receptionist's period. Administrator only. */
  setLeaveDeduction(request: ReceptionistLeaveDeductionRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/leave-deduction`, request);
  }
}
