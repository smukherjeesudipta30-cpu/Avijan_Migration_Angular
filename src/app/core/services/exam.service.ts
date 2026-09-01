import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  AdmitCard,
  AvailableExam,
  ExamPaper,
  ExamPaperPage,
  ExamPaperSaveRequest,
  ExamQuestion,
  ExamResult,
  ExamScheduleBulkRequest,
  ExamScheduleBulkResult,
  ExamScheduleRow,
  ExamScheduleSaveRequest,
  ExamSitting,
  ExamUploadResult,
  PracticalMarkRequest,
  PracticalRosterRow,
  StudentExamResults,
  SubmitExamRequest
} from '../models/exam.model';

/**
 * The examination portal. Two audiences on one service: `/exams` is the
 * administrator's side, `/my-exams` the student's.
 */
@Injectable({ providedIn: 'root' })
export class ExamService {
  private readonly http = inject(HttpClient);
  private readonly admin = `${environment.apiBaseUrl}/exams`;
  private readonly mine = `${environment.apiBaseUrl}/my-exams`;

  private params(values: Record<string, unknown>): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }

  /* ---------------------------------------------------------- admin */

  papers(page = 1, pageSize = 25, search?: string | null, courseId?: number | null): Observable<ExamPaperPage> {
    return this.http
      .get<ApiResponse<ExamPaperPage>>(this.admin, {
        params: this.params({ page, pageSize, search, courseId })
      })
      .pipe(map(r => r.data));
  }

  paper(examId: number): Observable<ExamPaper> {
    return this.http
      .get<ApiResponse<ExamPaper>>(`${this.admin}/${examId}`)
      .pipe(map(r => r.data));
  }

  createPaper(request: ExamPaperSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.admin, request);
  }

  updatePaper(examId: number, request: ExamPaperSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.admin}/${examId}`, request);
  }

  deletePaper(examId: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.admin}/${examId}`);
  }

  setPublished(examId: number, isPublished: boolean): Observable<ApiResponse<boolean>> {
    return this.http.patch<ApiResponse<boolean>>(
      `${this.admin}/${examId}/published`, {}, { params: this.params({ isPublished }) });
  }

  questions(examId: number): Observable<ExamQuestion[]> {
    return this.http
      .get<ApiResponse<ExamQuestion[]>>(`${this.admin}/${examId}/questions`)
      .pipe(map(r => r.data));
  }

  uploadQuestions(examId: number, file: File): Observable<ApiResponse<ExamUploadResult>> {
    const form = new FormData();
    form.append('file', file, file.name);

    return this.http.post<ApiResponse<ExamUploadResult>>(
      `${this.admin}/${examId}/questions/upload`, form);
  }

  /** The blank workbook. Fetched as a blob because it needs the bearer token. */
  questionTemplate(): Observable<Blob> {
    return this.http.get(`${this.admin}/questions/template`, { responseType: 'blob' });
  }

  practicalRoster(examId: number): Observable<PracticalRosterRow[]> {
    return this.http
      .get<ApiResponse<PracticalRosterRow[]>>(`${this.admin}/${examId}/practical/roster`)
      .pipe(map(r => r.data));
  }

  savePracticalMark(request: PracticalMarkRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.admin}/practical/marks`, request);
  }

  /* -------------------------------------- admin: sittings and codes */

  schedule(examId: number): Observable<ExamScheduleRow[]> {
    return this.http
      .get<ApiResponse<ExamScheduleRow[]>>(`${this.admin}/${examId}/schedule`)
      .pipe(map(r => r.data));
  }

  saveSchedule(request: ExamScheduleSaveRequest): Observable<ApiResponse<ExamScheduleRow>> {
    return this.http.post<ApiResponse<ExamScheduleRow>>(`${this.admin}/schedule`, request);
  }

  scheduleBatch(request: ExamScheduleBulkRequest): Observable<ApiResponse<ExamScheduleBulkResult>> {
    return this.http.post<ApiResponse<ExamScheduleBulkResult>>(
      `${this.admin}/schedule/batch`, request);
  }

  regenerateCode(examId: number, registrationId: string): Observable<ApiResponse<ExamScheduleRow>> {
    return this.http.post<ApiResponse<ExamScheduleRow>>(
      `${this.admin}/${examId}/schedule/${encodeURIComponent(registrationId)}/regenerate-code`, {});
  }

  removeSchedule(examId: number, registrationId: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(
      `${this.admin}/${examId}/schedule/${encodeURIComponent(registrationId)}`);
  }

  /* -------------------------------------------------------- student */

  available(): Observable<AvailableExam[]> {
    return this.http
      .get<ApiResponse<AvailableExam[]>>(this.mine)
      .pipe(map(r => r.data));
  }

  /** Needs the six digits the invigilator reads out; the sign-in alone will not do. */
  start(examId: number, accessCode: string): Observable<ApiResponse<ExamSitting>> {
    return this.http.post<ApiResponse<ExamSitting>>(
      `${this.mine}/${examId}/start`, { accessCode });
  }

  /** One card per examination the institute has scheduled this student for. */
  admitCards(): Observable<AdmitCard[]> {
    return this.http
      .get<ApiResponse<AdmitCard[]>>(`${this.mine}/admit-cards`)
      .pipe(map(r => r.data));
  }

  submit(request: SubmitExamRequest): Observable<ApiResponse<ExamResult>> {
    return this.http.post<ApiResponse<ExamResult>>(`${this.mine}/submit`, request);
  }

  myResults(): Observable<ExamResult[]> {
    return this.http
      .get<ApiResponse<ExamResult[]>>(`${this.mine}/results`)
      .pipe(map(r => r.data));
  }

  /** Each term read as one theory plus one practical, with the average and grade. */
  myCourseResults(): Observable<StudentExamResults> {
    return this.http
      .get<ApiResponse<StudentExamResults>>(`${this.mine}/course-results`)
      .pipe(map(r => r.data));
  }
}
