import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserRole } from '../models/auth.model';
import { AuthService } from '../services/auth.service';

/** The PreSchool's pages send a visitor to the PreSchool's own sign-in; every other page to the Computer Centre's. */
const loginFor = (url: string) => url.startsWith('/preschool') ? '/preschool/login' : '/login';

/** Blocks a route unless someone is signed in; remembers where they were going. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree([loginFor(state.url)], { queryParams: { returnUrl: state.url } });
  }

  // A migrated account is allowed no further than the change-password screen.
  if (auth.mustChangePassword()) {
    return router.parseUrl('/change-password');
  }

  return true;
};

/**
 * Guards /change-password itself. Signing in is required — beyond that, the
 * screen is open to anyone, forced reset or not. It started as forced-reset-only
 * because that was the only way in; it stays open now because every role (Admin
 * included) is entitled to change their own password whenever they want, not
 * only when the system makes them.
 */
export const passwordResetGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree([loginFor(state.url)], { queryParams: { returnUrl: state.url } });
  }

  return true;
};

/**
 * Route-level equivalent of `[Authorize(Roles = "...")]` on the API. The server
 * enforces this too — this only keeps the user out of a page that would 403.
 */
export function roleGuard(...roles: UserRole[]): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree([loginFor(state.url)], { queryParams: { returnUrl: state.url } });
    }

    if (auth.mustChangePassword()) {
      return router.parseUrl('/change-password');
    }

    if (auth.hasAnyRole(roles)) {
      return true;
    }

    // Signed in but wrong role — send them to their own landing page.
    return router.parseUrl(auth.user()?.landingRoute ?? '/');
  };
}
