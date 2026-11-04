import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  PreSchoolClass, PreSchoolClassSave, PreSchoolFeeHead, PreSchoolFeeHeadSave, PreSchoolGradeBand,
  PreSchoolGradeBandSave, PreSchoolOverview, PreSchoolSettings, PreSchoolSettingsSave, PreSchoolSubject,
  PreSchoolSubjectSave
} from '../models/preschool.model';

/** Avijan PreSchool's masters: classes, subjects, monthly fees, grades and settings. */
@Injectable({ providedIn: 'root' })
export class PreSchoolService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/preschool`;

  overview(): Observable<PreSchoolOverview> {
    return this.http.get<ApiResponse<PreSchoolOverview>>(`${this.base}/overview`).pipe(map(r => r.data));
  }

  saveClass(id: number | null, body: PreSchoolClassSave): Observable<PreSchoolClass> {
    const call = id === null
      ? this.http.post<ApiResponse<PreSchoolClass>>(`${this.base}/classes`, body)
      : this.http.put<ApiResponse<PreSchoolClass>>(`${this.base}/classes/${id}`, body);
    return call.pipe(map(r => r.data));
  }

  saveSubject(id: number | null, body: PreSchoolSubjectSave): Observable<PreSchoolSubject> {
    const call = id === null
      ? this.http.post<ApiResponse<PreSchoolSubject>>(`${this.base}/subjects`, body)
      : this.http.put<ApiResponse<PreSchoolSubject>>(`${this.base}/subjects/${id}`, body);
    return call.pipe(map(r => r.data));
  }

  saveFeeHead(id: number | null, body: PreSchoolFeeHeadSave): Observable<PreSchoolFeeHead> {
    const call = id === null
      ? this.http.post<ApiResponse<PreSchoolFeeHead>>(`${this.base}/fee-heads`, body)
      : this.http.put<ApiResponse<PreSchoolFeeHead>>(`${this.base}/fee-heads/${id}`, body);
    return call.pipe(map(r => r.data));
  }

  saveGradeBands(bands: PreSchoolGradeBandSave[]): Observable<PreSchoolGradeBand[]> {
    return this.http.put<ApiResponse<PreSchoolGradeBand[]>>(`${this.base}/grade-bands`, { bands }).pipe(map(r => r.data));
  }

  saveSettings(body: PreSchoolSettingsSave): Observable<PreSchoolSettings> {
    return this.http.put<ApiResponse<PreSchoolSettings>>(`${this.base}/settings`, body).pipe(map(r => r.data));
  }
}
