import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { DashboardSummary } from '../models/dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  getSummary(): Observable<DashboardSummary> {
    return this.http
      .get<ApiResponse<DashboardSummary>>(`${environment.apiBaseUrl}/dashboard/summary`)
      .pipe(map(response => response.data));
  }

  /** Clears one enquiry off the dashboard. The message itself is kept. */
  markEnquiryHandled(id: number): Observable<ApiResponse<boolean>> {
    return this.http.patch<ApiResponse<boolean>>(
      `${environment.apiBaseUrl}/dashboard/enquiries/${id}/handled`, {});
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
