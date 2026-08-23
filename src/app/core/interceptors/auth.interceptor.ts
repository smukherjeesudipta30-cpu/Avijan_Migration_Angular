import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

/** Guards against a burst of 401s all firing their own refresh call. */
let refreshInFlight = false;
const refreshedToken$ = new BehaviorSubject<string | null>(null);

const PUBLIC_PATHS = ['/auth/login', '/auth/refresh', '/public/'];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);

  const isPublic = PUBLIC_PATHS.some(path => request.url.includes(path));
  const token = auth.accessToken;

  const authorised = !isPublic && token ? withBearer(request, token) : request;

  return next(authorised).pipe(
    catchError((error: unknown) => {
      const shouldRefresh =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isPublic &&
        !!auth.refreshToken;

      return shouldRefresh
        ? retryWithRefresh(request, next, auth)
        : throwError(() => error);
    })
  );
};

function withBearer(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function retryWithRefresh(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService
): Observable<HttpEvent<unknown>> {
  if (refreshInFlight) {
    // Another request is already refreshing — queue behind it.
    return refreshedToken$.pipe(
      filter((token): token is string => token !== null),
      take(1),
      switchMap(token => next(withBearer(request, token)))
    );
  }

  refreshInFlight = true;
  refreshedToken$.next(null);

  return auth.refresh().pipe(
    switchMap(response => {
      refreshInFlight = false;
      refreshedToken$.next(response.data.accessToken);
      return next(withBearer(request, response.data.accessToken));
    }),
    catchError((error: unknown) => {
      refreshInFlight = false;
      auth.clearSession();
      return throwError(() => error);
    })
  );
}
