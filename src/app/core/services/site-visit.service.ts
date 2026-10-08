import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Observable, filter, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

export interface SiteVisitCount { name: string; visits: number; visitors: number; }
export interface SiteVisitDay { date: string; visits: number; visitors: number; }
export interface SiteVisitSummary {
  visitorsToday: number;
  visitorsLast7Days: number;
  visitorsLast30Days: number;
  visitsLast30Days: number;
  days: SiteVisitDay[];
  sources: SiteVisitCount[];
  pages: SiteVisitCount[];
  platforms: SiteVisitCount[];
}

/** Pages whose visits are counted — the public ones. */
const PUBLIC_PAGES = ['/', '/careers', '/competition'];

/**
 * Counts visits to the public pages for Admin's "Website visitors" report. No
 * cookies or personal data; the server keeps only the page, the day and where
 * the visitor came from.
 */
@Injectable({ providedIn: 'root' })
export class SiteVisitService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/site-visits`;
  private started = false;
  /** The referring site is only meaningful for the first page of a visit. */
  private firstPage = true;

  /** Called once at start-up: reports each public page as it is opened. */
  start(router: Router, platform: 'Web' | 'App' = 'Web'): void {
    if (this.started) return;
    this.started = true;

    router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(e => {
      const url = new URL(e.urlAfterRedirects, 'https://www.avijan.in');
      const path = url.pathname.length > 1 ? url.pathname.replace(/\/$/, '') : '/';
      if (!PUBLIC_PAGES.includes(path)) { this.firstPage = false; return; }

      const referrer = this.firstPage ? document.referrer || null : null;
      this.firstPage = false;
      this.http.post(this.base, {
        path,
        referrer,
        utmSource: url.searchParams.get('utm_source'),
        platform
      }).subscribe({ error: () => { /* a visit counter never troubles the page */ } });
    });
  }

  summary(days = 30): Observable<SiteVisitSummary> {
    return this.http.get<ApiResponse<SiteVisitSummary>>(`${this.base}/summary`, { params: { days } }).pipe(map(r => r.data));
  }
}
