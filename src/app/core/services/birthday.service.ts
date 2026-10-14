import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

export type BirthdayKind = 'Student' | 'Teacher' | 'Receptionist' | 'Technical Staff' | 'Editor' | 'Admin' | 'SuperAdmin' | 'Proprietor';

export interface BirthdayPerson {
  key: string;
  kind: BirthdayKind;
  name: string | null;
  phone: string | null;
  registrationId: string | null;
  loginId: string | null;
  dateOfBirth: string;
  nextBirthday: string;
  daysAway: number;
  turningAge: number;
}

export interface ProprietorProfile {
  name: string;
  dateOfBirth: string | null;
  phone: string | null;
}

@Injectable({ providedIn: 'root' })
export class BirthdayService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/birthdays`;

  upcoming(days = 30): Observable<BirthdayPerson[]> {
    return this.http.get<ApiResponse<BirthdayPerson[]>>(this.base, { params: { days } })
      .pipe(map(r => r.data ?? []));
  }

  proprietor(): Observable<ProprietorProfile> {
    return this.http.get<ApiResponse<ProprietorProfile>>(`${this.base}/proprietor`).pipe(map(r => r.data!));
  }

  saveProprietor(body: ProprietorProfile): Observable<ApiResponse<ProprietorProfile>> {
    return this.http.put<ApiResponse<ProprietorProfile>>(`${this.base}/proprietor`, body);
  }
}
