import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { UserRole } from '../models/auth.model';
import { AuthService } from '../services/auth.service';

/** Blocks a route unless someone is signed in; remembers where they were going. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
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

    if (auth.hasAnyRole(roles)) {
      return true;
    }

    // Signed in but wrong role — send them to their own landing page.
    return router.parseUrl(auth.user()?.landingRoute ?? '/about');
  };
}
