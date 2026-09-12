import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { OrgChart, OrgNodeSaveRequest } from '../models/org.model';

@Injectable({ providedIn: 'root' })
export class OrgService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/org`;

  /**
   * The whole chart. Teachers and receptionists are resolved server-side on every
   * call, so a person added this morning is on the chart this morning.
   */
  chart(): Observable<OrgChart> {
    return this.http
      .get<ApiResponse<OrgChart>>(`${this.base}/chart`)
      .pipe(map(r => r.data));
  }

  /**
   * The signed-in student's own line: the owner, and the teachers they are assigned
   * to. Resolved server-side from their sign-in, so it needs no argument and cannot
   * be pointed at anybody else.
   */
  myTeachers(): Observable<OrgChart> {
    return this.http
      .get<ApiResponse<OrgChart>>(`${this.base}/my-teachers`)
      .pipe(map(r => r.data));
  }

  create(request: OrgNodeSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(`${this.base}/nodes`, request);
  }

  update(id: number, request: OrgNodeSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/nodes/${id}`, request);
  }

  remove(id: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/nodes/${id}`);
  }

  uploadPhoto(id: number, file: File): Observable<ApiResponse<boolean>> {
    const form = new FormData();
    form.append('file', file);

    return this.http.post<ApiResponse<boolean>>(`${this.base}/nodes/${id}/photo`, form);
  }

  /**
   * A box's photograph, as bytes.
   *
   * <p>Deliberately not a URL for an <c>&lt;img src&gt;</c>: the endpoint is behind
   * the bearer token, and a plain image request carries no Authorization header, so
   * the browser is refused and the picture silently never appears. The same trap is
   * documented on the student photo endpoint — the bytes are fetched through
   * HttpClient, which the auth interceptor does reach, and turned into an object
   * URL.</p>
   */
  photoBlob(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/nodes/${id}/photo`, { responseType: 'blob' });
  }
}
