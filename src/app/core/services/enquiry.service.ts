import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  CourseEnquiry,
  CourseEnquiryFollowUpRequest,
  CourseEnquirySaveRequest,
  EnquiryReport
} from '../models/enquiry.model';
import { PagedResult } from '../models/student.model';

/** Filters shared by the register and the report. */
export interface EnquiryFilters {
  page?: number;
  pageSize?: number;
  /** Name or phone number. */
  search?: string | null;
  status?: string | null;
  courseId?: number | null;
  branchId?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
  /** Only open enquiries whose follow-up date has arrived. */
  dueOnly?: boolean;
}

/**
 * The walk-in enquiry register — what the receptionist takes at the counter, and
 * the follow-up report built on it.
 */
@Injectable({ providedIn: 'root' })
export class EnquiryService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/enquiries`;

  private params(values: Record<string, unknown>): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      // false is a meaningful value for dueOnly, so only null/undefined/'' drop out.
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }

  list(filters: EnquiryFilters): Observable<PagedResult<CourseEnquiry>> {
    return this.http
      .get<ApiResponse<PagedResult<CourseEnquiry>>>(this.base, {
        params: this.params({ page: 1, pageSize: 25, ...filters })
      })
      .pipe(map(r => r.data));
  }

  getById(id: number): Observable<CourseEnquiry> {
    return this.http
      .get<ApiResponse<CourseEnquiry>>(`${this.base}/${id}`)
      .pipe(map(r => r.data));
  }

  create(request: CourseEnquirySaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.base, request);
  }

  update(id: number, request: CourseEnquirySaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/${id}`, request);
  }

  /** Records a call. The remarks are appended by the server, not replaced. */
  recordFollowUp(
    id: number, request: CourseEnquiryFollowUpRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/${id}/follow-up`, request);
  }

  /** Administrator only — the server refuses anyone else. */
  delete(id: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/${id}`);
  }

  report(filters: EnquiryFilters): Observable<EnquiryReport> {
    return this.http
      .get<ApiResponse<EnquiryReport>>(`${this.base}/report`, {
        params: this.params({ ...filters })
      })
      .pipe(map(r => r.data));
  }
}
