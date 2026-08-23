import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AboutPage, ContactRequest } from '../models/about.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({ providedIn: 'root' })
export class AboutService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/public`;

  getAboutPage(): Observable<AboutPage> {
    return this.http
      .get<ApiResponse<AboutPage>>(`${this.base}/about`)
      .pipe(map(response => response.data));
  }

  submitContact(request: ContactRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(`${this.base}/contact`, request);
  }
}
