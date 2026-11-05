import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  AttendanceGrouping,
  AttendanceQr,
  AttendanceReport,
  AttendanceScanRequest,
  AttendanceChallenge,
  AttendanceScanResult,
  AttendanceShift,
  MyAttendance,
  SaveRotaRequest,
  StaffRota
} from '../models/attendance.model';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  protected readonly http = inject(HttpClient);
  /** Protected so the PreSchool can point the same screens at its own attendance. */
  protected readonly base: string = `${environment.apiBaseUrl}/attendance`;

  /** The code to display at the centre. Short-lived, so the screen re-asks. */
  qr(branchId?: number): Observable<AttendanceQr> {
    let params = new HttpParams();
    if (branchId) params = params.set('branchId', branchId);

    return this.http
      .get<ApiResponse<AttendanceQr>>(`${this.base}/qr`, { params })
      .pipe(map(r => r.data));
  }

  scan(request: AttendanceScanRequest): Observable<ApiResponse<AttendanceChallenge>> {
    return this.http.post<ApiResponse<AttendanceChallenge>>(`${this.base}/scan`, request);
  }

  /**
   * Marks attendance from this device with no code to scan — for a staff member
   * who has opened the site on their own phone and so has no second screen to point
   * a camera at. The branch is decided by where they are standing.
   */
  mark(latitude: number, longitude: number, accuracyMetres?: number):
    Observable<ApiResponse<AttendanceChallenge>> {
    return this.http.post<ApiResponse<AttendanceChallenge>>(
      `${this.base}/mark`, { latitude, longitude, accuracyMetres });
  }

  /** Completes a mark with the six digits from the email. */
  confirm(challengeId: number, code: string): Observable<ApiResponse<AttendanceScanResult>> {
    return this.http.post<ApiResponse<AttendanceScanResult>>(
      `${this.base}/confirm`, { challengeId, code });
  }

  /** Sends a fresh code for a mark still waiting. */
  resend(challengeId: number): Observable<ApiResponse<AttendanceChallenge>> {
    return this.http.post<ApiResponse<AttendanceChallenge>>(
      `${this.base}/resend/${challengeId}`, {});
  }

  me(onDate?: string): Observable<MyAttendance> {
    let params = new HttpParams();
    if (onDate) params = params.set('onDate', onDate);

    return this.http
      .get<ApiResponse<MyAttendance>>(`${this.base}/me`, { params })
      .pipe(map(r => r.data));
  }

  report(
    from: string,
    to: string,
    groupBy: AttendanceGrouping,
    staffType?: string | null,
    branch?: string | null
  ): Observable<AttendanceReport> {
    let params = new HttpParams().set('from', from).set('to', to).set('groupBy', groupBy);

    if (staffType) params = params.set('staffType', staffType);
    if (branch) params = params.set('branch', branch);

    return this.http
      .get<ApiResponse<AttendanceReport>>(`${this.base}/report`, { params })
      .pipe(map(r => r.data));
  }

  /* ---------------------------------------------------------------- rota */

  shifts(): Observable<AttendanceShift[]> {
    return this.http
      .get<ApiResponse<AttendanceShift[]>>(`${this.base}/shifts`)
      .pipe(map(r => r.data));
  }

  rota(staffType?: string): Observable<StaffRota[]> {
    let params = new HttpParams();
    if (staffType) params = params.set('staffType', staffType);

    return this.http
      .get<ApiResponse<StaffRota[]>>(`${this.base}/rota`, { params })
      .pipe(map(r => r.data));
  }

  saveRota(request: SaveRotaRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/rota`, request);
  }
}
