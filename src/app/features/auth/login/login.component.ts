import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Replaces `Views/Account/Login.cshtml`. On success the server tells us where the
 * role belongs (`user.landingRoute`), so the redirect logic that used to live in
 * `AccountController.cs:75-140` is not duplicated on the client.
 */
@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    MessageModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly year = new Date().getFullYear();

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  get email() {
    return this.form.controls.email;
  }

  get password() {
    return this.form.controls.password;
  }

  submit(): void {
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    // The Computer Centre's sign-in: a PreSchool account is sent to the PreSchool login instead.
    this.auth.login({ ...this.form.getRawValue(), school: 'computer' }).subscribe({
      next: response => {
        this.submitting.set(false);

        // A migrated account goes nowhere but the reset screen, whatever it was
        // originally reaching for. The returnUrl is dropped rather than kept for
        // afterwards: the reset revokes the session, so they sign in again and
        // land normally on the second pass.
        if (response.data.user.mustChangePassword) {
          void this.router.navigate(['/change-password']);
          return;
        }

        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl ?? response.data.user.landingRoute);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(this.describe(error));
        this.password.reset();
      }
    });
  }

  /** Login errors are shown inline rather than as a toast — the field is right there. */
  private describe(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Sign-in failed. Please try again.';
    }

    if (error.status === 0) {
      return 'Cannot reach the server. Check that the InstituteMS API is running.';
    }

    const body = error.error as ApiResponse<unknown> | null;

    if (body?.errors?.length) {
      return body.errors.join(' ');
    }

    return body?.message ?? 'Sign-in failed. Please try again.';
  }
}
