import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { PagedResult } from '../models/student.model';
import {
  RoleCount,
  UpcomingBirthday,
  UserListItem,
  UserQuery,
  UserSaveRequest
} from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/users`;

  list(query: UserQuery): Observable<PagedResult<UserListItem>> {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return this.http
      .get<ApiResponse<PagedResult<UserListItem>>>(this.base, { params })
      .pipe(map(r => r.data));
  }

  roles(): Observable<string[]> {
    return this.http
      .get<ApiResponse<string[]>>(`${this.base}/roles`)
      .pipe(map(r => r.data));
  }

  /** How many accounts hold each role, for the grid above the table. */
  roleCounts(): Observable<RoleCount[]> {
    return this.http
      .get<ApiResponse<RoleCount[]>>(`${this.base}/role-counts`)
      .pipe(map(r => r.data));
  }

  /** Live check for the form — true when the address is already taken. */
  emailExists(email: string, excludingUserId?: number | null): Observable<boolean> {
    let params = new HttpParams().set('email', email);
    if (excludingUserId) {
      params = params.set('excludingUserId', String(excludingUserId));
    }

    return this.http
      .get<ApiResponse<boolean>>(`${this.base}/email-exists`, { params })
      .pipe(map(r => r.data));
  }

  upcomingBirthdays(days = 30): Observable<UpcomingBirthday[]> {
    const params = new HttpParams().set('days', String(days));

    return this.http
      .get<ApiResponse<UpcomingBirthday[]>>(`${this.base}/birthdays/upcoming`, { params })
      .pipe(map(r => r.data));
  }

  create(request: UserSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.base, request);
  }

  update(id: number, request: UserSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/${id}`, request);
  }

  /**
   * Sets a user's password to a known value so an administrator can pass it on.
   * There is deliberately no matching "get": the stored value is a one-way hash.
   */
  setPassword(id: number, password: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/${id}/set-password`, { password });
  }

  setStatus(id: number, isActive: boolean): Observable<ApiResponse<boolean>> {
    const params = new HttpParams().set('isActive', String(isActive));

    return this.http.patch<ApiResponse<boolean>>(`${this.base}/${id}/status`, {}, { params });
  }
}
