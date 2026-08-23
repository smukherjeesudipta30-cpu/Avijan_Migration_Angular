import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  CourseListItem,
  CourseProgress,
  CourseSaveRequest,
  MarkListItem,
  MarkSaveRequest,
  NoticeListItem,
  NoticeSaveRequest
} from '../models/academic.model';
import { ApiResponse } from '../models/api-response.model';
import { PagedResult } from '../models/student.model';

/** Courses, marks and notices. */
@Injectable({ providedIn: 'root' })
export class AcademicService {
  private readonly http = inject(HttpClient);
  private readonly courseBase = `${environment.apiBaseUrl}/courses`;
  private readonly markBase = `${environment.apiBaseUrl}/marks`;
  private readonly noticeBase = `${environment.apiBaseUrl}/notices`;

  private params(values: Record<string, unknown>): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }

  /* ----------------------------------------------------------- courses */

  courses(page = 1, pageSize = 25, search?: string | null): Observable<PagedResult<CourseListItem>> {
    return this.http
      .get<ApiResponse<PagedResult<CourseListItem>>>(this.courseBase, {
        params: this.params({ page, pageSize, search })
      })
      .pipe(map(r => r.data));
  }

  courseNameExists(name: string, excludingCourseId?: number | null): Observable<boolean> {
    return this.http
      .get<ApiResponse<boolean>>(`${this.courseBase}/name-exists`, {
        params: this.params({ name, excludingCourseId })
      })
      .pipe(map(r => r.data));
  }

  courseProgress(
    page = 1,
    pageSize = 25,
    courseId?: number | null,
    registrationId?: string | null
  ): Observable<PagedResult<CourseProgress>> {
    return this.http
      .get<ApiResponse<PagedResult<CourseProgress>>>(`${this.courseBase}/progress`, {
        params: this.params({ page, pageSize, courseId, registrationId })
      })
      .pipe(map(r => r.data));
  }

  createCourse(request: CourseSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.courseBase, request);
  }

  updateCourse(courseId: number, request: CourseSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.courseBase}/${courseId}`, request);
  }

  deleteCourse(courseId: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.courseBase}/${courseId}`);
  }

  /* ------------------------------------------------------------- marks */

  marks(
    page = 1,
    pageSize = 25,
    registrationId?: string | null,
    search?: string | null
  ): Observable<PagedResult<MarkListItem>> {
    return this.http
      .get<ApiResponse<PagedResult<MarkListItem>>>(this.markBase, {
        params: this.params({ page, pageSize, registrationId, search })
      })
      .pipe(map(r => r.data));
  }

  createMark(request: MarkSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.markBase, request);
  }

  updateMark(id: number, request: MarkSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.markBase}/${id}`, request);
  }

  deleteMark(id: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.markBase}/${id}`);
  }

  /* ----------------------------------------------------------- notices */

  notices(page = 1, pageSize = 25, search?: string | null): Observable<PagedResult<NoticeListItem>> {
    return this.http
      .get<ApiResponse<PagedResult<NoticeListItem>>>(this.noticeBase, {
        params: this.params({ page, pageSize, search })
      })
      .pipe(map(r => r.data));
  }

  createNotice(request: NoticeSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.noticeBase, request);
  }

  updateNotice(id: number, request: NoticeSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.noticeBase}/${id}`, request);
  }

  deleteNotice(id: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.noticeBase}/${id}`);
  }
}
