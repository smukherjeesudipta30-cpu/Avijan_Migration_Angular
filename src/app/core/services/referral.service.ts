import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { ReferralSettings, ReferralSlab, ReferrerOption } from '../models/referral.model';

/** Admission referral commission: referrers, and the Admin-set slabs. */
@Injectable({ providedIn: 'root' })
export class ReferralService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/referrals`;

  referrers(): Observable<ReferrerOption[]> {
    return this.http.get<ApiResponse<ReferrerOption[]>>(`${this.base}/referrers`).pipe(map(r => r.data));
  }

  settings(): Observable<ReferralSettings> {
    return this.http.get<ApiResponse<ReferralSettings>>(`${this.base}/settings`).pipe(map(r => r.data));
  }

  saveSettings(slabs: ReferralSlab[]): Observable<ApiResponse<ReferralSettings>> {
    return this.http.put<ApiResponse<ReferralSettings>>(`${this.base}/settings`, { slabs });
  }
}

/** The percentage a fee earns under the slabs: the highest slab not above it, else 0. */
export function referralPercentFor(fee: number | null | undefined, slabs: ReferralSlab[]): number {
  if (!fee) return 0;
  const match = [...slabs].sort((a, b) => b.minFee - a.minFee).find(s => fee >= s.minFee);
  return match?.percent ?? 0;
}
