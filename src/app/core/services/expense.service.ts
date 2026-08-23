import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { ExpenseList, ExpenseSaveRequest } from '../models/expense.model';

/** The institute expense register. */
@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/expenses`;

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
    search?: string | null
  ): Observable<ExpenseList> {
    return this.http
      .get<ApiResponse<ExpenseList>>(this.base, {
        params: this.params({ page, pageSize, from, to, search })
      })
      .pipe(map(r => r.data));
  }

  create(request: ExpenseSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.base, request);
  }

  update(expenseId: number, request: ExpenseSaveRequest): Observable<ApiResponse<boolean>> {
    return this.http.put<ApiResponse<boolean>>(`${this.base}/${expenseId}`, request);
  }

  delete(expenseId: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/${expenseId}`);
  }
}
