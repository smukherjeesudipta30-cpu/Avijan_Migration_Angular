import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

export interface PreSchoolExam { id: number; name: string; heldOn: string | null; sortOrder: number; isActive: boolean; }
export interface PreSchoolMarkSubject { id: number; name: string; maxMarks: number; }
/** `marks` is left out by the API while not entered yet. */
export interface PreSchoolMarkCell { subjectId: number; marks?: number | null; isAbsent: boolean; }
export interface PreSchoolMarkRow {
  studentId: number;
  admissionCode: string;
  childName: string;
  marks: PreSchoolMarkCell[];
  total: number;
  outOf: number;
  percent: number | null;
  grade: string | null;
}
export interface PreSchoolMarkSheet {
  examId: number;
  examName: string;
  classId: number;
  className: string;
  subjects: PreSchoolMarkSubject[];
  rows: PreSchoolMarkRow[];
}
export interface PreSchoolMarkEntry { studentId: number; subjectId: number; marks: number | null; isAbsent: boolean; }

/** PreSchool exams and the marks entered for them. */
@Injectable({ providedIn: 'root' })
export class PreSchoolMarksService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/preschool`;

  exams(): Observable<PreSchoolExam[]> {
    return this.http.get<ApiResponse<PreSchoolExam[]>>(`${this.base}/exams`).pipe(map(r => r.data));
  }

  saveExam(id: number | null, body: { name: string; heldOn: string | null; sortOrder: number; isActive: boolean }): Observable<PreSchoolExam> {
    const call = id === null
      ? this.http.post<ApiResponse<PreSchoolExam>>(`${this.base}/exams`, body)
      : this.http.put<ApiResponse<PreSchoolExam>>(`${this.base}/exams/${id}`, body);
    return call.pipe(map(r => r.data));
  }

  sheet(examId: number, classId: number): Observable<PreSchoolMarkSheet> {
    return this.http.get<ApiResponse<PreSchoolMarkSheet>>(`${this.base}/marks`, { params: { examId, classId } }).pipe(map(r => r.data));
  }

  save(examId: number, classId: number, entries: PreSchoolMarkEntry[]): Observable<PreSchoolMarkSheet> {
    return this.http.put<ApiResponse<PreSchoolMarkSheet>>(`${this.base}/marks`, { examId, classId, entries }).pipe(map(r => r.data));
  }
}
