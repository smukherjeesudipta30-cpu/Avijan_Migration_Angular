import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserRole } from '../models/auth.model';
import { AuthService } from '../services/auth.service';

/** Blocks a route unless someone is signed in; remembers where they were going. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  // A migrated account is allowed no further than the change-password screen.
  if (auth.mustChangePassword()) {
    return router.parseUrl('/change-password');
  }

  return true;
};

/**
 * Guards /change-password itself. Signing in is required, but a user who does not
 * owe a reset should not be stranded on a screen meant for one - they are sent to
 * their own landing page instead.
 */
export const passwordResetGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  return auth.mustChangePassword()
    ? true
    : router.parseUrl(auth.user()?.landingRoute ?? '/');
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
      return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
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
