import { HttpClient, HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { JobApplication, JobApplicationStatus, JobApply, Vacancy, VacancySave } from '../models/career.model';

/** Job vacancies: the public list and apply, and Admin's side of both. */
@Injectable({ providedIn: 'root' })
export class CareerService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/careers`;

  /** Open vacancies. Public. */
  open(): Observable<Vacancy[]> {
    return this.http.get<ApiResponse<Vacancy[]>>(this.base).pipe(map(r => r.data ?? []));
  }

  /** Applies, reporting upload progress. Public. */
  apply(vacancyId: number, request: JobApply): Observable<HttpEvent<ApiResponse<number>>> {
    return this.http.post<ApiResponse<number>>(`${this.base}/${vacancyId}/apply`, request,
      { reportProgress: true, observe: 'events' });
  }

  /* ------------------------------------------------------------ Admin */

  vacancies(): Observable<Vacancy[]> {
    return this.http.get<ApiResponse<Vacancy[]>>(`${this.base}/vacancies`).pipe(map(r => r.data ?? []));
  }

  save(id: number | null, request: VacancySave): Observable<ApiResponse<Vacancy>> {
    return id
      ? this.http.put<ApiResponse<Vacancy>>(`${this.base}/vacancies/${id}`, request)
      : this.http.post<ApiResponse<Vacancy>>(`${this.base}/vacancies`, request);
  }

  delete(id: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/vacancies/${id}`);
  }

  applications(vacancyId?: number | null): Observable<JobApplication[]> {
    const params: Record<string, number> = vacancyId ? { vacancyId } : {};
    return this.http.get<ApiResponse<JobApplication[]>>(`${this.base}/applications`, { params })
      .pipe(map(r => r.data ?? []));
  }

  setStatus(id: number, status: JobApplicationStatus, adminNote: string | null): Observable<ApiResponse<JobApplication>> {
    return this.http.put<ApiResponse<JobApplication>>(`${this.base}/applications/${id}/status`, { status, adminNote });
  }

  /** The applicant's CV or photograph. */
  file(id: number, kind: 'cv' | 'photo'): Observable<Blob> {
    return this.http.get(`${this.base}/applications/${id}/file`, { params: { kind }, responseType: 'blob' });
  }
}
