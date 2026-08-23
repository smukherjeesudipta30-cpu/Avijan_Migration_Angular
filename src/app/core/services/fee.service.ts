import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  FeeCalculation,
  FeeCalculationRequest,
  FeePayment,
  FeeReceipt,
  FeeRecorded,
  FeeSaveRequest,
  StudentFeeBill
} from '../models/fee.model';
import { PagedResult } from '../models/student.model';

@Injectable({ providedIn: 'root' })
export class FeeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/fees`;

  // Registration ids contain slashes, so they travel as query parameters.
  bill(registrationId: string): Observable<StudentFeeBill> {
    const params = new HttpParams().set('registrationId', registrationId);

    return this.http
      .get<ApiResponse<StudentFeeBill>>(`${this.base}/bill`, { params })
      .pipe(map(r => r.data));
  }

  payments(registrationId: string, page = 1, pageSize = 10): Observable<PagedResult<FeePayment>> {
    const params = new HttpParams()
      .set('registrationId', registrationId)
      .set('page', String(page))
      .set('pageSize', String(pageSize));

    return this.http
      .get<ApiResponse<PagedResult<FeePayment>>>(`${this.base}/payments`, { params })
      .pipe(map(r => r.data));
  }

  /** Server works out days elapsed, late fine, total and new due. */
  calculate(request: FeeCalculationRequest): Observable<FeeCalculation> {
    return this.http
      .post<ApiResponse<FeeCalculation>>(`${this.base}/calculate`, request)
      .pipe(map(r => r.data));
  }

  record(request: FeeSaveRequest): Observable<ApiResponse<FeeRecorded>> {
    return this.http.post<ApiResponse<FeeRecorded>>(`${this.base}/payments`, request);
  }

  update(id: number, request: FeeSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/payments/${id}`, request);
  }

  receipt(id: number): Observable<FeeReceipt> {
    return this.http
      .get<ApiResponse<FeeReceipt>>(`${this.base}/payments/${id}/receipt`)
      .pipe(map(r => r.data));
  }
}
