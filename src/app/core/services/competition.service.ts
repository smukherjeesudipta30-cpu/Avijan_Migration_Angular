import { HttpClient, HttpEvent, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  CompetitionDraft,
  CompetitionDraftChangePasswordRequest,
  CompetitionDraftForgotPasswordRequest,
  CompetitionDraftLoginRequest,
  CompetitionDraftResetPasswordRequest,
  CompetitionDraftRow,
  CompetitionDraftStartRequest,
  CompetitionDraftStarted,
  CompetitionOrganiserSaveRequest,
  CompetitionPublic,
  CompetitionRegisterRequest,
  CompetitionRegistered,
  CompetitionReport,
  CompetitionSaveRequest
} from '../models/competition.model';

@Injectable({ providedIn: 'root' })
export class CompetitionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/competitions`;

  /* ------------------------------------------------------------- public */

  /** The advertisement. Answers null when no competition has been set up. */
  publicNotice(): Observable<CompetitionPublic | null> {
    return this.http
      .get<ApiResponse<CompetitionPublic | null>>(`${this.base}/public`)
      .pipe(map(r => r.data));
  }

  /** The same registration, reporting upload progress for the progress bar. */
  registerWithProgress(request: CompetitionRegisterRequest): Observable<HttpEvent<ApiResponse<CompetitionRegistered>>> {
    return this.http.post<ApiResponse<CompetitionRegistered>>(`${this.base}/register`, request,
      { reportProgress: true, observe: 'events' });
  }

  register(request: CompetitionRegisterRequest): Observable<ApiResponse<CompetitionRegistered>> {
    return this.http.post<ApiResponse<CompetitionRegistered>>(`${this.base}/register`, request);
  }

  /* -------------------------------------------------------- save and resume */

  startDraft(request: CompetitionDraftStartRequest): Observable<ApiResponse<CompetitionDraftStarted>> {
    return this.http.post<ApiResponse<CompetitionDraftStarted>>(`${this.base}/drafts`, request);
  }

  resumeDraft(request: CompetitionDraftLoginRequest): Observable<ApiResponse<CompetitionDraft>> {
    return this.http.post<ApiResponse<CompetitionDraft>>(`${this.base}/drafts/login`, request);
  }

  changeDraftPassword(request: CompetitionDraftChangePasswordRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/drafts/change-password`, request);
  }

  /** Step one of recovery for a draft that cannot sign in at all. */
  forgotDraftPassword(request: CompetitionDraftForgotPasswordRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/drafts/forgot-password`, request);
  }

  /** Step two: the emailed code, spent to set a new password without the old one. */
  resetDraftPassword(request: CompetitionDraftResetPasswordRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/drafts/reset-password`, request);
  }

  drafts(competitionId?: number | null): Observable<CompetitionDraftRow[]> {
    let params = new HttpParams();
    if (competitionId) params = params.set('competitionId', String(competitionId));

    return this.http
      .get<ApiResponse<CompetitionDraftRow[]>>(`${this.base}/drafts`, { params })
      .pipe(map(r => r.data));
  }

  /* ------------------------------------------------------------- office */

  report(
    year?: number | null,
    kind?: string | null,
    paymentStatus?: string | null,
    search?: string | null
  ): Observable<CompetitionReport> {
    let params = new HttpParams();

    if (year) params = params.set('year', String(year));
    if (kind) params = params.set('kind', kind);
    if (paymentStatus) params = params.set('paymentStatus', paymentStatus);
    if (search) params = params.set('search', search);

    return this.http
      .get<ApiResponse<CompetitionReport>>(`${this.base}/report`, { params })
      .pipe(map(r => r.data));
  }

  setPaymentStatus(applicantId: number, status: string): Observable<ApiResponse<boolean>> {
    const params = new HttpParams().set('status', status);

    return this.http.patch<ApiResponse<boolean>>(
      `${this.base}/registrations/${applicantId}/payment`, {}, { params });
  }

  /**
   * The chest number sheet as a PDF, for an entrant with no account.
   *
   * Identified by registration number plus the phone number on their form, and
   * refused until the office has confirmed the payment.
   */
  chestCard(registrationNo: string, phone: string): Observable<Blob> {
    const params = new HttpParams()
      .set('registrationNo', registrationNo)
      .set('phone', phone);

    return this.http.get(`${this.base}/chest-card`, { params, responseType: 'blob' });
  }

  /** Where the public portal reads one of the two posters from. Anonymous. */
  advertUrl(competitionId: number, slot: 'Drawing' | 'Dance'): string {
    return `${this.base}/${competitionId}/advert?slot=${slot}`;
  }

  /** Uploads or replaces a poster. Admin only. */
  uploadAdvert(
    competitionId: number, slot: 'Drawing' | 'Dance', file: File
  ): Observable<ApiResponse<boolean>> {
    const form = new FormData();
    form.append('file', file);

    const params = new HttpParams().set('slot', slot);

    return this.http.post<ApiResponse<boolean>>(
      `${this.base}/${competitionId}/advert`, form, { params });
  }

  removeAdvert(competitionId: number, slot: 'Drawing' | 'Dance'): Observable<ApiResponse<boolean>> {
    const params = new HttpParams().set('slot', slot);

    return this.http.delete<ApiResponse<boolean>>(
      `${this.base}/${competitionId}/advert`, { params });
  }

  /** Cancels a registration and refunds it in full. Admin only. */
  cancel(applicantId: number, reason: string): Observable<ApiResponse<boolean>> {
    const params = new HttpParams().set('reason', reason);

    return this.http.patch<ApiResponse<boolean>>(
      `${this.base}/registrations/${applicantId}/cancel`, {}, { params });
  }

  /**
   * A document, as bytes.
   *
   * Not a URL for an `<img src>`: the endpoint is behind the bearer token, and a
   * plain image request carries no Authorization header — the same trap the staff
   * photographs hit.
   */
  documentBlob(applicantId: number, kind: string): Observable<Blob> {
    const params = new HttpParams().set('kind', kind);

    return this.http.get(
      `${this.base}/registrations/${applicantId}/document`, { params, responseType: 'blob' });
  }

  /* ----------------------------------------------------------- settings */

  all(): Observable<CompetitionPublic[]> {
    return this.http
      .get<ApiResponse<CompetitionPublic[]>>(this.base)
      .pipe(map(r => r.data));
  }

  create(request: CompetitionSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(this.base, request);
  }

  update(id: number, request: CompetitionSaveRequest): Observable<ApiResponse<number>> {
    return this.http.put<ApiResponse<number>>(`${this.base}/${id}`, request);
  }

  addOrganiser(id: number, request: CompetitionOrganiserSaveRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(`${this.base}/${id}/organisers`, request);
  }

  updateOrganiser(
    id: number, organiserId: number, request: CompetitionOrganiserSaveRequest
  ): Observable<ApiResponse<number>> {
    return this.http.put<ApiResponse<number>>(`${this.base}/${id}/organisers/${organiserId}`, request);
  }

  deleteOrganiser(organiserId: number): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/organisers/${organiserId}`);
  }
}
