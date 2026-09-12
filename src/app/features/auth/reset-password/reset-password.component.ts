import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Step two of account recovery: the code just emailed, spent to set a new
 * password without the old one. The email is pre-filled from the previous
 * screen's query param but stays editable — nothing stops someone pasting a
 * code here without having gone through step one first.
 */
@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, PasswordModule, MessageModule],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly done = signal(false);
  readonly year = new Date().getFullYear();

  readonly form = this.fb.nonNullable.group(
    {
      email: [this.route.snapshot.queryParamMap.get('email') ?? '', [Validators.required, Validators.email]],
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          // Mirrors ResetPasswordRequestValidator on the API.
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)
        ]
      ],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: [matchPasswords] }
  );

  get email() {
    return this.form.controls.email;
  }

  get code() {
    return this.form.controls.code;
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
    const { email, code, newPassword } = this.form.getRawValue();

    this.auth.resetPassword(email, code, newPassword).subscribe({
      next: () => {
        this.submitting.set(false);
        this.done.set(true);
        setTimeout(() => void this.router.navigate(['/login']), 1600);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(this.describe(error));
        this.code.reset();
      }
    });
  }

  private describe(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'The password could not be reset. Please try again.';
    }

    if (error.status === 0) {
      return 'Cannot reach the server. Please try again in a moment.';
    }

    if (error.status === 429) {
      return 'Too many wrong codes. Request a new one from the previous screen.';
    }

    const body = error.error as ApiResponse<unknown> | null;

    if (body?.errors?.length) {
      return body.errors.join(' ');
    }

    return body?.message ?? 'The password could not be reset. Please try again.';
  }
}

/** Group-level: the confirmation box has to agree with the new password. */
function matchPasswords(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;

  return !next || !confirm || next === confirm ? null : { passwordMismatch: true };
}
