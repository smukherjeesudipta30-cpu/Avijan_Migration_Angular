import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  AdmissionDue,
  AdmissionDueCollectRequest,
  AdmissionReceipt,
  BranchLookup,
  CourseLookup,
  NextRegistration,
  PagedResult,
  StudentCreated,
  StudentListItem,
  StudentLookup,
  StudentPhoto,
  StudentQuery,
  StudentSaveRequest,
  SuggestedLogin,
  TeacherLookup
} from '../models/student.model';

@Injectable({ providedIn: 'root' })
export class StudentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/students`;

  list(query: StudentQuery): Observable<PagedResult<StudentListItem>> {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return this.http
      .get<ApiResponse<PagedResult<StudentListItem>>>(this.base, { params })
      .pipe(map(r => r.data));
  }

  getById(id: number): Observable<StudentListItem> {
    return this.http
      .get<ApiResponse<StudentListItem>>(`${this.base}/${id}`)
      .pipe(map(r => r.data));
  }

  // Registration ids contain slashes (AVI/3451/26), so they travel as a query
  // parameter — a path segment would be split on the decoded '/'.
  getByRegistrationId(registrationId: string): Observable<StudentListItem> {
    const params = new HttpParams().set('registrationId', registrationId);

    return this.http
      .get<ApiResponse<StudentListItem>>(`${this.base}/by-reg`, { params })
      .pipe(map(r => r.data));
  }

  /** includeCompleted: also students who have finished their course. */
  lookup(search: string, includeCompleted = false): Observable<StudentLookup[]> {
    let params = new HttpParams().set('search', search);
    if (includeCompleted) params = params.set('includeCompleted', 'true');

    return this.http
      .get<ApiResponse<StudentLookup[]>>(`${this.base}/lookup`, { params })
      .pipe(map(r => r.data));
  }

  /** Preview only — the real pair is reserved under lock when the student is saved. */
  nextRegistrationNo(branchId?: number | null): Observable<NextRegistration> {
    let params = new HttpParams();
    if (branchId) {
      params = params.set('branchId', String(branchId));
    }

    return this.http
      .get<ApiResponse<NextRegistration>>(`${this.base}/next-registration-no`, { params })
      .pipe(map(r => r.data));
  }

  /**
   * The Avijan portal sign-in that will be issued for a name, so the form can show
   * it before saving. Generated server-side, where the uniqueness check can
   * actually see the database.
   */
  suggestLogin(name: string, excludingStudentId?: number | null): Observable<SuggestedLogin> {
    let params = new HttpParams().set('name', name);

    if (excludingStudentId) {
      params = params.set('excludingStudentId', String(excludingStudentId));
    }

    return this.http
      .get<ApiResponse<SuggestedLogin>>(`${this.base}/suggest-login`, { params })
      .pipe(map(r => r.data));
  }

  create(request: StudentSaveRequest): Observable<ApiResponse<StudentCreated>> {
    return this.http.post<ApiResponse<StudentCreated>>(this.base, request);
  }

  update(id: number, request: StudentSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/${id}`, request);
  }

  deactivate(id: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/${id}`);
  }

  activate(registrationId: string): Observable<ApiResponse<number>> {
    const params = new HttpParams().set('registrationId', registrationId);

    return this.http.patch<ApiResponse<number>>(`${this.base}/activate`, {}, { params });
  }

  receipt(id: number): Observable<AdmissionReceipt> {
    return this.http
      .get<ApiResponse<AdmissionReceipt>>(`${this.base}/${id}/receipt`)
      .pipe(map(r => r.data));
  }

  /**
   * The photo endpoint requires a bearer token, which an `<img src>` cannot send,
   * so the bytes are fetched through HttpClient and turned into an object URL.
   */
  photoBlob(registrationId: string): Observable<Blob> {
    const params = new HttpParams().set('registrationId', registrationId);

    return this.http.get(`${this.base}/photo`, { params, responseType: 'blob' });
  }

  courses(): Observable<CourseLookup[]> {
    return this.http
      .get<ApiResponse<CourseLookup[]>>(`${environment.apiBaseUrl}/courses/lookup`)
      .pipe(map(r => r.data));
  }

  teachers(): Observable<TeacherLookup[]> {
    return this.http
      .get<ApiResponse<TeacherLookup[]>>(`${environment.apiBaseUrl}/teachers/lookup`)
      .pipe(map(r => r.data));
  }

  branches(): Observable<BranchLookup[]> {
    return this.http
      .get<ApiResponse<BranchLookup[]>>(`${environment.apiBaseUrl}/branches/lookup`)
      .pipe(map(r => r.data));
  }

  /** Multipart upload — PNG/JPEG/GIF, 512 KB max, enforced again on the server. */
  uploadPhoto(registrationId: string, file: File): Observable<ApiResponse<StudentPhoto>> {
    const params = new HttpParams().set('registrationId', registrationId);
    const form = new FormData();
    form.append('file', file, file.name);

    return this.http.post<ApiResponse<StudentPhoto>>(`${this.base}/photo`, form, { params });
  }

  deletePhoto(registrationId: string): Observable<ApiResponse<boolean>> {
    const params = new HttpParams().set('registrationId', registrationId);

    return this.http.delete<ApiResponse<boolean>>(`${this.base}/photo`, { params });
  }

  /* ------------------------------- admission fee, part payment */

  /** What a student still owes on their admission fee, with its receipts. */
  admissionDue(studentId: number): Observable<AdmissionDue> {
    return this.http
      .get<ApiResponse<AdmissionDue>>(`${this.base}/${studentId}/admission-due`)
      .pipe(map(r => r.data));
  }

  /** Takes an instalment against an outstanding admission fee. */
  collectAdmissionDue(
    studentId: number,
    request: AdmissionDueCollectRequest
  ): Observable<ApiResponse<AdmissionDue>> {
    return this.http.post<ApiResponse<AdmissionDue>>(
      `${this.base}/${studentId}/admission-due/collect`,
      request
    );
  }
}
