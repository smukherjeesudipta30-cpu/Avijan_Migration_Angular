import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  ExamAnswerCopy,
  ExamAttemptReview,
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
  ExamViolationResult,
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

  /** Staff: a submitted online paper, read-only, with the correct options. */
  attemptReview(attemptId: number): Observable<ExamAttemptReview> {
    return this.http
      .get<ApiResponse<ExamAttemptReview>>(`${this.admin}/attempts/${attemptId}/review`)
      .pipe(map(r => r.data));
  }

  /** Student: their own submitted paper, read-only, without the correct options. */
  myReview(attemptId: number): Observable<ExamAttemptReview> {
    return this.http
      .get<ApiResponse<ExamAttemptReview>>(`${this.mine}/results/${attemptId}/review`)
      .pipe(map(r => r.data));
  }

  answerCopies(examId: number, registrationId: string): Observable<ExamAnswerCopy[]> {
    return this.http
      .get<ApiResponse<ExamAnswerCopy[]>>(`${this.admin}/${examId}/answer-copies`, {
        params: this.params({ registrationId })
      })
      .pipe(map(r => r.data));
  }

  uploadAnswerCopies(examId: number, registrationId: string, files: File[]): Observable<ExamAnswerCopy[]> {
    const form = new FormData();
    files.forEach(f => form.append('files', f, f.name));

    return this.http
      .post<ApiResponse<ExamAnswerCopy[]>>(`${this.admin}/${examId}/answer-copies`, form, {
        params: this.params({ registrationId })
      })
      .pipe(map(r => r.data));
  }

  answerCopyFile(copyId: number): Observable<Blob> {
    return this.http.get(`${this.admin}/answer-copies/${copyId}`, { responseType: 'blob' });
  }

  deleteAnswerCopy(copyId: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.admin}/answer-copies/${copyId}`);
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

  /* The registration id goes in the query string, not the path: it contains
     slashes ("AVI/Raj/4998/26"), which no amount of encoding makes safe as a path
     segment. HttpParams encodes it properly. */

  regenerateCode(examId: number, registrationId: string): Observable<ApiResponse<ExamScheduleRow>> {
    return this.http.post<ApiResponse<ExamScheduleRow>>(
      `${this.admin}/${examId}/schedule/regenerate-code`, {},
      { params: new HttpParams().set('registrationId', registrationId) });
  }

  removeSchedule(examId: number, registrationId: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(
      `${this.admin}/${examId}/schedule`,
      { params: new HttpParams().set('registrationId', registrationId) });
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

  /**
   * Saves the answers chosen so far. The server marks this copy if the paper is
   * submitted after time is up, so it is what protects a student whose browser or
   * connection dies mid-paper.
   */
  saveProgress(attemptId: number, answers: Record<number, string>):
    Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(
      `${this.mine}/progress`, { attemptId, answers });
  }

  submit(request: SubmitExamRequest): Observable<ApiResponse<ExamResult>> {
    return this.http.post<ApiResponse<ExamResult>>(`${this.mine}/submit`, request);
  }

  /**
   * Reports the student leaving the exam window (exited fullscreen, switched
   * tabs, lost focus). Counted against the attempt on the server, so the
   * strike count survives a page reload.
   */
  recordViolation(attemptId: number, reason: string): Observable<ApiResponse<ExamViolationResult>> {
    return this.http.post<ApiResponse<ExamViolationResult>>(
      `${this.mine}/violation`, { attemptId, reason });
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
