import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { IncomeDetail, IncomeReport, IncomeSection } from '../models/income.model';
import { PagedResult } from '../models/student.model';

@Injectable({ providedIn: 'root' })
export class IncomeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/income`;

  /** Pass a branch to scope every figure to it; omit for the whole institute. */
  report(from: string, to: string, branch?: string | null): Observable<IncomeReport> {
    let params = new HttpParams().set('from', from).set('to', to);

    if (branch) params = params.set('branch', branch);

    return this.http
      .get<ApiResponse<IncomeReport>>(`${this.base}/report`, { params })
      .pipe(map(r => r.data));
  }

  detail(
    section: IncomeSection,
    from: string,
    to: string,
    page = 1,
    pageSize = 25,
    branch?: string | null
  ): Observable<PagedResult<IncomeDetail>> {
    let params = new HttpParams()
      .set('section', section)
      .set('from', from)
      .set('to', to)
      .set('page', String(page))
      .set("pageSize", String(pageSize));

    if (branch) params = params.set("branch", branch);

    return this.http
      .get<ApiResponse<PagedResult<IncomeDetail>>>(`${this.base}/detail`, { params })
      .pipe(map(r => r.data));
  }
}
