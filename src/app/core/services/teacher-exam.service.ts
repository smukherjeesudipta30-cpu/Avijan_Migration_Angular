import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  RecordTeacherExamViolationRequest,
  TeacherExamAssignment,
  TeacherExamAssignmentRequest,
  TeacherExamPaper,
  TeacherExamResult,
  TeacherExamScheduleItem,
  TeacherExamScheduleRequest,
  TeacherExamSubmitRequest,
  TeacherExamViolationResult
} from '../models/teacher-exam.model';

/**
 * The teacher competency exam portal: Admin assigns a teacher to a course,
 * sets a sitting's date/time, AI generates that sitting's questions, and the
 * teacher takes it.
 */
@Injectable({ providedIn: 'root' })
export class TeacherExamService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/teacher-exams`;

  /* -------------------------------------------------------- assignments */

  assignments(): Observable<TeacherExamAssignment[]> {
    return this.http
      .get<ApiResponse<TeacherExamAssignment[]>>(`${this.base}/assignments`)
      .pipe(map(r => r.data));
  }

  createAssignment(request: TeacherExamAssignmentRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(`${this.base}/assignments`, request);
  }

  setAssignmentActive(id: number, isActive: boolean): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/assignments/${id}/active?isActive=${isActive}`, {});
  }

  /* ---------------------------------------------------------- schedules */

  schedule(request: TeacherExamScheduleRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(`${this.base}/schedules`, request);
  }

  schedules(): Observable<TeacherExamScheduleItem[]> {
    return this.http
      .get<ApiResponse<TeacherExamScheduleItem[]>>(`${this.base}/schedules`)
      .pipe(map(r => r.data));
  }

  /* -------------------------------------------------- the teacher's own */

  my(): Observable<TeacherExamScheduleItem[]> {
    return this.http
      .get<ApiResponse<TeacherExamScheduleItem[]>>(`${this.base}/my`)
      .pipe(map(r => r.data));
  }

  start(scheduleId: number): Observable<ApiResponse<TeacherExamPaper>> {
    return this.http.post<ApiResponse<TeacherExamPaper>>(`${this.base}/schedules/${scheduleId}/start`, {});
  }

  submit(request: TeacherExamSubmitRequest): Observable<ApiResponse<TeacherExamResult>> {
    return this.http.post<ApiResponse<TeacherExamResult>>(`${this.base}/submit`, request);
  }

  recordViolation(request: RecordTeacherExamViolationRequest): Observable<ApiResponse<TeacherExamViolationResult>> {
    return this.http.post<ApiResponse<TeacherExamViolationResult>>(`${this.base}/violation`, request);
  }
}
