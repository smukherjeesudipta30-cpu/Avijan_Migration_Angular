import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

interface Features {
  attendance: boolean;
  org: boolean;
  competition: boolean;
}

/**
 * Which optional features are switched on server-side.
 *
 * <p>Read once at start-up and held in a signal, so the menu and the route guards
 * can ask synchronously. A feature that has not answered yet counts as off: a menu
 * entry that appears and then vanishes is worse than one that arrives a moment
 * late.</p>
 *
 * <p>This governs only what is <em>shown</em>. Every endpoint behind a feature is
 * guarded by role on the server regardless, so turning a flag on is a decision
 * about visibility, not about security.</p>
 */
@Injectable({ providedIn: 'root' })
export class FeaturesService {
  private readonly http = inject(HttpClient);

  private readonly features = signal<Features>({ attendance: false, org: false, competition: false });

  readonly attendance = () => this.features().attendance;

  /** Whether the staff hierarchy chart is shown. */
  readonly org = () => this.features().org;

  /** Whether the Drawing & Dance competition portal is shown. */
  readonly competition = () => this.features().competition;

  load(): void {
    this.http
      .get<ApiResponse<Features>>(`${environment.apiBaseUrl}/public/features`)
      .subscribe({
        next: response => this.features.set(response.data),
        // An older API build has no such endpoint. Everything stays off, which is
        // exactly the behaviour that existed before the feature did.
        error: () => this.features.set({ attendance: false, org: false, competition: false })
      });
  }
}
