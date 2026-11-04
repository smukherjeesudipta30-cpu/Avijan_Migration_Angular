import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { AuthResult, AuthUser, LoginRequest, PRESCHOOL_ROLES, UserRole } from '../models/auth.model';

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

  /** True while a migrated account still owes its first-login password reset. */
  readonly mustChangePassword = computed(() => this.currentUser()?.mustChangePassword === true);

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

  /**
   * Replaces the caller's password. The API revokes every refresh token as it
   * does so, which is why the caller signs back in afterwards rather than
   * carrying on with a token that still says a reset is owed.
   */
  changePassword(currentPassword: string, newPassword: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/change-password`, {
      currentPassword,
      newPassword
    });
  }

  /**
   * Step one of account recovery. Always resolves the same way regardless of
   * whether the address matched anything — that is the server's call to make,
   * not this method's, so the response is passed straight through.
   */
  forgotPassword(email: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/forgot-password`, { email });
  }

  /** Step two: the emailed code, spent to set a new password without the old one. */
  resetPassword(email: string, code: string, newPassword: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/reset-password`, {
      email,
      code,
      newPassword
    });
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
    // Asked before the user is forgotten: a PreSchool account goes back to the
    // PreSchool's own sign-in, everyone else to the Computer Centre's.
    const loginPage = this.loginPageFor(this.currentUser()?.roles ?? []);

    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);

    if (redirect) {
      void this.router.navigate([loginPage]);
    }
  }

  /** The sign-in page for these roles: the PreSchool's for a PreSchool-only account. */
  loginPageFor(roles: UserRole[]): string {
    const preschoolOnly = roles.some(r => PRESCHOOL_ROLES.includes(r))
      && !roles.some(r => !PRESCHOOL_ROLES.includes(r));
    return preschoolOnly ? '/preschool/login' : '/login';
  }

  /** True when the user holds any of the given roles — a user can hold several. */
  /**
   * True when the user holds any of the given roles — a user can hold several.
   * SuperAdmin passes regardless of what was asked for, mirroring the API's
   * global SuperAdminAuthorizationHandler, so a route/screen guarded for e.g.
   * "Admin,Editor" doesn't also need "SuperAdmin" spelled out everywhere.
   */
  hasAnyRole(roles: UserRole[]): boolean {
    const held = this.currentUser()?.roles ?? [];
    if (held.includes('SuperAdmin')) return true;
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
