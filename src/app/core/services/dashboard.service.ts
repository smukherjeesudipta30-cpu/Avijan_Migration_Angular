import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  DashboardSummary,
  EnquiryFilter,
  EnquiryList
} from '../models/dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  /** @param cycleMonth 'yyyy-MM-01' of the month a pay cycle ends in; omitted for the running cycle. */
  getSummary(cycleMonth?: string | null): Observable<DashboardSummary> {
    return this.http
      .get<ApiResponse<DashboardSummary>>(`${environment.apiBaseUrl}/dashboard/summary`, {
        params: cycleMonth ? { cycleMonth } : {}
      })
      .pipe(map(response => response.data));
  }

  /**
   * Marks one enquiry read, or puts it back to new.
   *
   * The message itself is never deleted — pass `handled: false`, or list them with
   * {@link enquiries} and 'Read', to get it back.
   */
  markEnquiryHandled(id: number, handled = true): Observable<ApiResponse<boolean>> {
    const params = new HttpParams().set('handled', String(handled));

    return this.http.patch<ApiResponse<boolean>>(
      `${environment.apiBaseUrl}/dashboard/enquiries/${id}/handled`, {}, { params });
  }

  /** Enquiries by state — how a message is found again after it is marked read. */
  enquiries(filter: EnquiryFilter = 'New', page = 1, pageSize = 25): Observable<EnquiryList> {
    const params = new HttpParams()
      .set('filter', filter)
      .set('page', String(page))
      .set('pageSize', String(pageSize));

    return this.http
      .get<ApiResponse<EnquiryList>>(`${environment.apiBaseUrl}/dashboard/enquiries`, { params })
      .pipe(map(r => r.data));
  }

  /** Dismisses one alert. The row is kept, only marked read. */
  markNotificationRead(id: number): Observable<ApiResponse<boolean>> {
    return this.http.patch<ApiResponse<boolean>>(
      `${environment.apiBaseUrl}/dashboard/notifications/${id}/read`, {});
  }

  /** Clears the badge in one go. Returns how many were marked. */
  markAllNotificationsRead(): Observable<ApiResponse<number>> {
    return this.http.patch<ApiResponse<number>>(
      `${environment.apiBaseUrl}/dashboard/notifications/read-all`, {});
  }
}
