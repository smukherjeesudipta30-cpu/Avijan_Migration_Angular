import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { OtherIncomeList, OtherIncomeSaveRequest } from '../models/other-income.model';

/**
 * The non-fee income register. Feeds the "Other income" line of the income
 * report, branch-wise and month-wise.
 */
@Injectable({ providedIn: 'root' })
export class OtherIncomeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/other-income`;

  private params(values: Record<string, unknown>): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }

  list(
    page = 1,
    pageSize = 25,
    from?: string | null,
    to?: string | null,
    search?: string | null,
    branch?: string | null
  ): Observable<OtherIncomeList> {
    return this.http
      .get<ApiResponse<OtherIncomeList>>(this.base, {
        params: this.params({ page, pageSize, from, to, search, branch })
      })
      .pipe(map(r => r.data));
  }

  create(request: OtherIncomeSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.base, request);
  }

  update(incomeId: number, request: OtherIncomeSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/${incomeId}`, request);
  }

  delete(incomeId: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/${incomeId}`);
  }
}
