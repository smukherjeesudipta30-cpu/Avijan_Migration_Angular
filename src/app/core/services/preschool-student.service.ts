import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  PreSchoolAdmissionReport, PreSchoolCollect, PreSchoolPendingReport, PreSchoolReceipt, PreSchoolStudentDetail,
  PreSchoolPhotoSlot, PreSchoolStudentListItem, PreSchoolStudentPhotos, PreSchoolStudentSave
} from '../models/preschool-student.model';

/** Avijan PreSchool admissions, fee collection, receipts and their reports. */
@Injectable({ providedIn: 'root' })
export class PreSchoolStudentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/preschool`;

  list(filter: { search?: string; classId?: number | null; status?: string | null }): Observable<PreSchoolStudentListItem[]> {
    const params: Record<string, string> = {};
    if (filter.search) params['search'] = filter.search;
    if (filter.classId) params['classId'] = String(filter.classId);
    if (filter.status) params['status'] = filter.status;
    return this.http.get<ApiResponse<PreSchoolStudentListItem[]>>(`${this.base}/students`, { params }).pipe(map(r => r.data));
  }

  get(id: number): Observable<PreSchoolStudentDetail> {
    return this.http.get<ApiResponse<PreSchoolStudentDetail>>(`${this.base}/students/${id}`).pipe(map(r => r.data));
  }

  save(id: number | null, body: PreSchoolStudentSave): Observable<PreSchoolStudentDetail> {
    const call = id === null
      ? this.http.post<ApiResponse<PreSchoolStudentDetail>>(`${this.base}/students`, body)
      : this.http.put<ApiResponse<PreSchoolStudentDetail>>(`${this.base}/students/${id}`, body);
    return call.pipe(map(r => r.data));
  }

  photos(id: number): Observable<PreSchoolStudentPhotos> {
    return this.http.get<ApiResponse<PreSchoolStudentPhotos>>(`${this.base}/students/${id}/photos`).pipe(map(r => r.data));
  }

  /** Saves one photo; null removes it. */
  savePhoto(id: number, slot: PreSchoolPhotoSlot, dataUrl: string | null): Observable<PreSchoolStudentPhotos> {
    return this.http.put<ApiResponse<PreSchoolStudentPhotos>>(`${this.base}/students/${id}/photos/${slot}`, { dataUrl })
      .pipe(map(r => r.data));
  }

  collect(studentId: number, body: PreSchoolCollect): Observable<PreSchoolReceipt> {
    return this.http.post<ApiResponse<PreSchoolReceipt>>(`${this.base}/students/${studentId}/receipts`, body).pipe(map(r => r.data));
  }

  receipt(id: number): Observable<PreSchoolReceipt> {
    return this.http.get<ApiResponse<PreSchoolReceipt>>(`${this.base}/receipts/${id}`).pipe(map(r => r.data));
  }

  cancelReceipt(id: number): Observable<PreSchoolReceipt> {
    return this.http.put<ApiResponse<PreSchoolReceipt>>(`${this.base}/receipts/${id}/cancel`, null).pipe(map(r => r.data));
  }

  pending(classId: number | null, minMonths: number): Observable<PreSchoolPendingReport> {
    const params: Record<string, string> = { minMonths: String(minMonths) };
    if (classId) params['classId'] = String(classId);
    return this.http.get<ApiResponse<PreSchoolPendingReport>>(`${this.base}/reports/pending-fees`, { params }).pipe(map(r => r.data));
  }

  admissions(year: number, classId: number | null): Observable<PreSchoolAdmissionReport> {
    const params: Record<string, string> = { year: String(year) };
    if (classId) params['classId'] = String(classId);
    return this.http.get<ApiResponse<PreSchoolAdmissionReport>>(`${this.base}/reports/admissions`, { params }).pipe(map(r => r.data));
  }
}
