import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  BranchListItem,
  BranchSaveRequest,
  TeacherAccount,
  TeacherEarning,
  TeacherListItem,
  TeacherPayment,
  TeacherPaymentRequest,
  TeacherSaveRequest
} from '../models/master.model';
import { PagedResult } from '../models/student.model';

/** Teacher and Branch master data. */
@Injectable({ providedIn: 'root' })
export class MasterService {
  private readonly http = inject(HttpClient);
  private readonly teacherBase = `${environment.apiBaseUrl}/teachers`;
  private readonly branchBase = `${environment.apiBaseUrl}/branches`;

  /* ---------------------------------------------------------- teachers */

  teachers(
    page = 1,
    pageSize = 10,
    search?: string | null,
    includePlaceholders = true
  ): Observable<PagedResult<TeacherListItem>> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize))
      .set('includePlaceholders', String(includePlaceholders));

    if (search) {
      params = params.set('search', search);
    }

    return this.http
      .get<ApiResponse<PagedResult<TeacherListItem>>>(this.teacherBase, { params })
      .pipe(map(r => r.data));
  }

  /** Live duplicate check for the user-id box (legacy ufnGetTecChk). */
  teacherLoginExists(loginId: string, excludingTeacherId?: number | null): Observable<boolean> {
    let params = new HttpParams().set('loginId', loginId);
    if (excludingTeacherId) {
      params = params.set('excludingTeacherId', String(excludingTeacherId));
    }

    return this.http
      .get<ApiResponse<boolean>>(`${this.teacherBase}/login-exists`, { params })
      .pipe(map(r => r.data));
  }

  teacherEarnings(
    teacherId: number,
    from?: string | null,
    to?: string | null,
    page = 1,
    pageSize = 25
  ): Observable<PagedResult<TeacherEarning>> {
    let params = new HttpParams().set('page', String(page)).set('pageSize', String(pageSize));
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);

    return this.http
      .get<ApiResponse<PagedResult<TeacherEarning>>>(`${this.teacherBase}/${teacherId}/earnings`, { params })
      .pipe(map(r => r.data));
  }

  createTeacher(request: TeacherSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.teacherBase, request);
  }

  updateTeacher(id: number, request: TeacherSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.teacherBase}/${id}`, request);
  }

  deleteTeacher(id: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.teacherBase}/${id}`);
  }

  /* ---------------------------------------------------------- branches */

  branches(): Observable<BranchListItem[]> {
    return this.http
      .get<ApiResponse<BranchListItem[]>>(this.branchBase)
      .pipe(map(r => r.data));
  }

  createBranch(request: BranchSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.branchBase, request);
  }

  updateBranch(id: number, request: BranchSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.branchBase}/${id}`, request);
  }

  setBranchStatus(id: number, isActive: boolean): Observable<ApiResponse<boolean>> {
    const params = new HttpParams().set('isActive', String(isActive));

    return this.http.patch<ApiResponse<boolean>>(`${this.branchBase}/${id}/status`, {}, { params });
  }

  /* ------------------------------ payments made to a teacher */

  teacherAccount(
    teacherId: number,
    from?: string | null,
    to?: string | null
  ): Observable<TeacherAccount> {
    let params = new HttpParams();
    if (from) params = params.set("from", from);
    if (to) params = params.set("to", to);

    return this.http
      .get<ApiResponse<TeacherAccount>>(`${this.teacherBase}/${teacherId}/account`, { params })
      .pipe(map(r => r.data));
  }

  teacherPayments(
    teacherId: number,
    from?: string | null,
    to?: string | null
  ): Observable<TeacherPayment[]> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);

    return this.http
      .get<ApiResponse<TeacherPayment[]>>(`${this.teacherBase}/${teacherId}/payments`, { params })
      .pipe(map(r => r.data));
  }

  /** Records money handed to a teacher. Administrator only. */
  recordTeacherPayment(request: TeacherPaymentRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(
      `${this.teacherBase}/${request.teacherId}/payments`, request);
  }

  deleteTeacherPayment(paymentId: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.teacherBase}/payments/${paymentId}`);
  }
}
