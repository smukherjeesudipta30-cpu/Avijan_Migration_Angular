import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

/** The admission offer as Admin/Receptionist set it. Dates are "yyyy-MM-dd". */
export interface OfferSettings {
  percentage: number;
  startsOn: string;
  days: number;
  endsOn: string;
  isShowing: boolean;
  modifiedBy: string | null;
  modifiedOn: string | null;
}

export interface OfferSave {
  percentage: number;
  startsOn: string;
  days: number;
}

/** What the front page's corner ribbon shows; null when no offer is running. */
export interface OfferPublic {
  percentage: number;
  endsOn: string;
}

/** The admission offer on the public front page. */
@Injectable({ providedIn: 'root' })
export class OfferService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/offer`;

  publicOffer(): Observable<OfferPublic | null> {
    return this.http.get<ApiResponse<OfferPublic | null>>(`${this.base}/public`).pipe(map(r => r.data));
  }

  settings(): Observable<OfferSettings | null> {
    return this.http.get<ApiResponse<OfferSettings | null>>(`${this.base}/settings`).pipe(map(r => r.data));
  }

  save(request: OfferSave): Observable<OfferSettings> {
    return this.http.put<ApiResponse<OfferSettings>>(`${this.base}/settings`, request).pipe(map(r => r.data));
  }
}
