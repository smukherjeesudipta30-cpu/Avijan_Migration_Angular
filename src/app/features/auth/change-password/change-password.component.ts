import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/services/auth.service';

/**
 * The forced first-login password reset.
 *
 * Every account carried over from the legacy system was migrated with the password
 * it already had, hashed, plus a flag saying that password is not good enough to keep:
 * it was stored in plain text for years and the people who ran the old system have
 * seen it. This screen is where that flag is cleared, and `authGuard` allows a
 * flagged account nowhere else.
 *
 * The same screen serves a voluntary change, so there is one password form rather
 * than two - `forced()` only decides the wording.
 */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PasswordModule, MessageModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss'
})
export class ChangePasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly done = signal(false);
  readonly year = new Date().getFullYear();

  readonly forced = this.auth.mustChangePassword;
  readonly userName = () => this.auth.user()?.name ?? '';

  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          // Mirrors ChangePasswordRequestValidator on the API. Duplicated
          // deliberately: the server is the authority, this is only so the user
          // finds out before a round trip.
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
        ]
      ],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: [matchPasswords, differsFromCurrent] }
  );

  get currentPassword() {
    return this.form.controls.currentPassword;
  }

  get newPassword() {
    return this.form.controls.newPassword;
  }

  get confirmPassword() {
    return this.form.controls.confirmPassword;
  }

  submit(): void {
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();

    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.done.set(true);

        /* The API revoked every refresh token as part of the change, so the token
           in hand is dead and still carries the old must_change_password claim.
           Clearing the session locally and sending them back to sign in is the
           honest end to the flow - anything else leaves a session that the next
           request would reject anyway. */
        setTimeout(() => this.auth.clearSession(false), 1200);
        setTimeout(() => void this.router.navigate(['/login']), 1400);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(this.describe(error));
        this.currentPassword.reset();
      }
    });
  }

  /** Available even mid-reset, so nobody is trapped on this screen. */
  signOut(): void {
    this.auth.logout();
  }

  /** Only offered for a voluntary visit — a forced reset has nowhere else to go. */
  cancel(): void {
    void this.router.navigateByUrl(this.auth.user()?.landingRoute ?? '/');
  }

  private describe(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'The password could not be changed. Please try again.';
    }

    if (error.status === 0) {
      return 'Cannot reach the server. Please try again in a moment.';
    }

    const body = error.error as ApiResponse<unknown> | null;

    if (body?.errors?.length) {
      return body.errors.join(' ');
    }

    return body?.message ?? 'The password could not be changed. Please try again.';
  }
}

/** Group-level: the confirmation box has to agree with the new password. */
function matchPasswords(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;

  return !next || !confirm || next === confirm ? null : { passwordMismatch: true };
}

/**
 * Group-level: the whole point of the forced reset is to retire the legacy
 * password, so re-entering it is refused here as well as on the server.
 */
function differsFromCurrent(group: AbstractControl): ValidationErrors | null {
  const current = group.get('currentPassword')?.value;
  const next = group.get('newPassword')?.value;

  return !current || !next || current !== next ? null : { passwordUnchanged: true };
}
