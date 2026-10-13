import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

export interface CertificateSettings {
  signatoryName: string;
  signatoryTitle: string;
  signatureDataUrl: string | null;
  stampDataUrl: string | null;
  modifiedBy: string | null;
  modifiedOn: string | null;
}

export interface CertificateSettingsSave {
  signatoryName: string;
  signatoryTitle: string;
  signatureContentType: string | null;
  signatureBase64: string | null;
  stampContentType: string | null;
  stampBase64: string | null;
  removeSignature: boolean;
  removeStamp: boolean;
}

export interface CertificateVerification {
  certificateNo: string;
  studentName: string | null;
  registrationId: string | null;
  courseName: string | null;
  grade: string | null;
  completedOn: string | null;
  issueNo: number;
  isDuplicate: boolean;
  issuedOn: string;
}

/** The certificate's signatory (Admin) and the public QR check. */
@Injectable({ providedIn: 'root' })
export class CertificateService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/certificates`;

  settings(): Observable<CertificateSettings> {
    return this.http.get<ApiResponse<CertificateSettings>>(`${this.base}/settings`).pipe(map(r => r.data));
  }

  save(request: CertificateSettingsSave): Observable<CertificateSettings> {
    return this.http.put<ApiResponse<CertificateSettings>>(`${this.base}/settings`, request).pipe(map(r => r.data));
  }

  verify(code: string): Observable<CertificateVerification> {
    return this.http.get<ApiResponse<CertificateVerification>>(`${this.base}/verify/${encodeURIComponent(code)}`)
      .pipe(map(r => r.data));
  }
}
