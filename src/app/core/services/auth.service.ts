import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { AuthResult, AuthUser, LoginRequest, UserRole } from '../models/auth.model';

/** Persisted so a page refresh does not sign the user out. */
const ACCESS_TOKEN_KEY = 'institutems.accessToken';
const REFRESH_TOKEN_KEY = 'institutems.refreshToken';
const USER_KEY = 'institutems.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  private readonly currentUser = signal<AuthUser | null>(this.readStoredUser());

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed<UserRole | null>(() => this.currentUser()?.role ?? null);

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  login(request: LoginRequest): Observable<ApiResponse<AuthResult>> {
    return this.http
      .post<ApiResponse<AuthResult>>(`${this.base}/login`, request)
      .pipe(tap(response => this.storeSession(response.data)));
  }

  /** Used by the auth interceptor when a request comes back 401. */
  refresh(): Observable<ApiResponse<AuthResult>> {
    return this.http
      .post<ApiResponse<AuthResult>>(`${this.base}/refresh`, { refreshToken: this.refreshToken ?? '' })
      .pipe(tap(response => this.storeSession(response.data)));
  }

  logout(): void {
    // Revoke server-side, but clear locally regardless of the outcome — the user
    // asked to sign out and must not be left in a half-signed-in state.
    this.http.post<ApiResponse<unknown>>(`${this.base}/logout`, {}).subscribe({
      next: () => this.clearSession(),
      error: () => this.clearSession()
    });
  }

  clearSession(redirect = true): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);

    if (redirect) {
      void this.router.navigate(['/login']);
    }
  }

  /** True when the user holds any of the given roles — a user can hold several. */
  hasAnyRole(roles: UserRole[]): boolean {
    const held = this.currentUser()?.roles ?? [];
    return held.some(role => roles.includes(role));
  }

  private storeSession(result: AuthResult): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    this.currentUser.set(result.user);
  }

  private readStoredUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      // Corrupt entry — drop it rather than crashing the app on bootstrap.
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }
}
