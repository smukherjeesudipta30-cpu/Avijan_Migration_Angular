import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

/**
 * Requests whose failures must not raise a toast:
 *  - `/auth/login` — the login page shows the error inline, next to the form.
 *  - `/auth/refresh` — a failed refresh is always accompanied by the original
 *    request's own error, which produces the one toast the user should see.
 */
const SILENT_PATHS = ['/auth/login', '/auth/refresh'];

/** Surfaces server errors as a PrimeNG toast. */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const messages = inject(MessageService);

  return next(request).pipe(
    catchError((error: unknown) => {
      const silent = SILENT_PATHS.some(path => request.url.includes(path));

      if (error instanceof HttpErrorResponse && !silent) {
        messages.add({
          severity: error.status === 403 ? 'warn' : 'error',
          summary: titleFor(error.status),
          detail: detailFor(error),
          life: 6000
        });
      }

      return throwError(() => error);
    })
  );
};

function titleFor(status: number): string {
  switch (status) {
    case 0:
      return 'Cannot reach the server';
    case 401:
      return 'Session expired';
    case 403:
      return 'Not permitted';
    case 404:
      return 'Not found';
    case 429:
      return 'Too many requests';
    default:
      return 'Something went wrong';
  }
}

function detailFor(error: HttpErrorResponse): string {
  if (error.status === 0) {
    // Status 0 means the request never completed. Usually that is the API being
    // down — but a CORS rejection looks identical from here, because the browser
    // blocks the response before Angular ever sees it. Name both causes, so this
    // does not send anyone hunting for a stopped service that is actually running.
    return (
      `Could not reach ${environment.apiBaseUrl}. Either the API is not running, ` +
      `or it rejected this page's origin (${window.location.origin}) via CORS. ` +
      'The browser console will show a CORS message if that is the cause.'
    );
  }

  const body = error.error as ApiResponse<unknown> | null;

  if (body?.errors?.length) {
    return body.errors.join(' ');
  }

  return body?.message ?? error.message ?? 'Unexpected error.';
}
