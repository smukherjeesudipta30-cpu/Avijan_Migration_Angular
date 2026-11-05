import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { AttendanceService } from './attendance.service';

export interface PreSchoolAttendanceVisit { in: string; out?: string | null; hours?: number | null; }

export interface PreSchoolAttendanceStaffRow {
  staffId: number;
  staffName: string;
  role: string;
  daysPresent: number;
  daysAbsent: number;
  totalHours: number;
  daysMissingOut: number;
}

export interface PreSchoolAttendanceDay {
  onDate: string;
  staffId: number;
  staffName: string;
  role: string;
  firstIn?: string | null;
  lastOut?: string | null;
  hours?: number | null;
  missingOut: boolean;
  visits: PreSchoolAttendanceVisit[];
}

export interface PreSchoolAttendanceReport {
  from: string;
  to: string;
  staff: PreSchoolAttendanceStaffRow[];
  days: PreSchoolAttendanceDay[];
  totalHours: number;
}

/**
 * The Computer Centre's attendance calls, pointed at the PreSchool's own
 * attendance. Provided in place of AttendanceService on the /preschool
 * attendance routes, so the same screens mark PreSchool attendance there.
 */
@Injectable()
export class PreSchoolAttendanceService extends AttendanceService {
  protected override readonly base = `${environment.apiBaseUrl}/preschool/attendance`;

  /** Everyone's days between two dates; the PreSchool admin only. */
  preSchoolReport(from: string, to: string, staffId?: number | null): Observable<PreSchoolAttendanceReport> {
    let params = new HttpParams().set('from', from).set('to', to);
    if (staffId) params = params.set('staffId', staffId);
    return this.http.get<ApiResponse<PreSchoolAttendanceReport>>(`${this.base}/report`, { params }).pipe(map(r => r.data));
  }
}
