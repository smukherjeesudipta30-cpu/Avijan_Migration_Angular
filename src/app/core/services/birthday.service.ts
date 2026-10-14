import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

export type BirthdayKind = 'Student' | 'Teacher' | 'Receptionist' | 'Technical Staff' | 'Editor' | 'Admin' | 'SuperAdmin';

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

@Injectable({ providedIn: 'root' })
export class BirthdayService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/birthdays`;

  upcoming(days = 30): Observable<BirthdayPerson[]> {
    return this.http.get<ApiResponse<BirthdayPerson[]>>(this.base, { params: { days } })
      .pipe(map(r => r.data ?? []));
  }
}
