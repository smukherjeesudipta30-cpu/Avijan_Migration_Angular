import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Step one of account recovery: which address the reset code should go to.
 *
 * The server's response never says whether that address matched an account —
 * this screen always moves on to the code-entry step, so a stranger probing
 * for valid logins learns nothing either way. Someone who mistyped their own
 * address just gets no email and can try again.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, MessageModule],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly year = new Date().getFullYear();

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  get email() {
    return this.form.controls.email;
  }

  submit(): void {
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const email = this.email.value;

    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigate(['/reset-password'], { queryParams: { email } });
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(this.describe(error));
      }
    });
  }

  private describe(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Something went wrong. Please try again.';
    }

    if (error.status === 0) {
      return 'Cannot reach the server. Please try again in a moment.';
    }

    if (error.status === 429) {
      return 'Too many attempts. Please wait a few minutes and try again.';
    }

    const body = error.error as ApiResponse<unknown> | null;

    if (body?.errors?.length) {
      return body.errors.join(' ');
    }

    return body?.message ?? 'Something went wrong. Please try again.';
  }
}
