import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiResponse } from '../../../core/models/api-response.model';
import { AuthService } from '../../../core/services/auth.service';
import { SchoolTabsComponent } from '../../../shared/school-tabs/school-tabs.component';

/**
 * Avijan PreSchool's own sign-in, at /preschool/login, for its admin,
 * receptionist, teachers and parents. It turns away Computer Centre accounts
 * (the server checks; SuperAdmin passes both), as the Computer Centre's login
 * turns away PreSchool ones.
 */
@Component({
  selector: 'app-preschool-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SchoolTabsComponent],
  template: `
    <app-school-tabs current="preschool" />

    <div class="pl">
      <section class="pl__art" aria-hidden="true">
        <span class="pl__b pl__b--1">🎨</span><span class="pl__b pl__b--2">🧸</span><span class="pl__b pl__b--3">📚</span>
        <h2>Avijan PreSchool</h2>
        <p>Play Group · Nursery · LKG · UKG</p>
      </section>

      <section class="pl__card">
        <a routerLink="/preschool" class="pl__brand"><span class="pl__mark">A</span> <span><strong>Avijan</strong> PreSchool</span></a>
        <h1>Sign in</h1>
        <p class="pl__sub">For the PreSchool's staff and parents.</p>

        @if (error(); as e) { <p class="pl__error" role="alert">{{ e }}</p> }

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label>Email
            <input type="email" formControlName="email" autocomplete="username" placeholder="you@example.com" />
          </label>
          @if (form.controls.email.touched && form.controls.email.invalid) { <small class="pl__hint">Enter a valid email address.</small> }

          <label>Password
            <span class="pl__pw">
              <input [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
              <button type="button" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'">
                <i class="pi" [class.pi-eye]="!showPassword()" [class.pi-eye-slash]="showPassword()" aria-hidden="true"></i></button>
            </span>
          </label>
          @if (form.controls.password.touched && form.controls.password.invalid) { <small class="pl__hint">Enter your password.</small> }

          <button type="submit" class="pl__go" [disabled]="submitting()">{{ submitting() ? 'Signing in…' : 'Sign in' }}</button>
        </form>

        <div class="pl__links">
          <a routerLink="/forgot-password">Forgot password?</a>
          <a routerLink="/preschool">Back to the PreSchool</a>
          <a routerLink="/privacy">Privacy</a>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #fffaf3; color: #2a2f45; font-family: 'Nunito', 'Segoe UI', system-ui, sans-serif; }
    .pl { display: grid; grid-template-columns: 1fr minmax(20rem, 26rem); gap: 2rem; align-items: center; max-width: 1000px;
      margin: 0 auto; padding: 2.5rem 1.25rem; min-height: calc(100vh - 3rem); }
    .pl__art { position: relative; height: 26rem; border-radius: 40% 60% 55% 45% / 50% 45% 55% 50%; display: flex; flex-direction: column;
      justify-content: center; align-items: center; text-align: center; background: radial-gradient(circle at 30% 30%, #ffd6e7, #d9ecff 60%, #e2f7dc); }
    .pl__art h2 { margin: 0; font-size: 2rem; }
    .pl__art p { margin: 0.3rem 0 0; font-weight: 700; color: #b3264f; }
    .pl__b { position: absolute; display: grid; place-items: center; width: 4.2rem; height: 4.2rem; border-radius: 50%; background: #fff;
      font-size: 2rem; box-shadow: 0 8px 20px rgba(42, 47, 69, 0.1); }
    .pl__b--1 { top: 12%; left: 14%; } .pl__b--2 { top: 16%; right: 14%; } .pl__b--3 { bottom: 12%; left: 40%; }
    .pl__card { background: #fff; border-radius: 24px; padding: 2rem 1.75rem; box-shadow: 0 14px 40px rgba(42, 47, 69, 0.08); }
    .pl__brand { display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none; color: inherit; font-size: 1.1rem; }
    .pl__mark { display: grid; place-items: center; width: 2.1rem; height: 2.1rem; border-radius: 12px; background: #ff6b8b; color: #fff; font-weight: 800; transform: rotate(-6deg); }
    .pl__card h1 { margin: 1.1rem 0 0.2rem; font-size: 1.7rem; }
    .pl__sub { margin: 0 0 1.1rem; color: #5b6178; }
    .pl__error { margin: 0 0 0.9rem; padding: 0.6rem 0.8rem; border-radius: 12px; background: #fde8e8; color: #b42318; font-weight: 600; }
    form { display: flex; flex-direction: column; gap: 0.4rem; }
    label { display: flex; flex-direction: column; gap: 0.3rem; font-weight: 700; font-size: 0.9rem; margin-top: 0.5rem; }
    input { padding: 0.7rem 0.85rem; border: 2px solid #e6e1d8; border-radius: 14px; font: inherit; font-weight: 400; background: #fffdf9; width: 100%; box-sizing: border-box; }
    input:focus { outline: none; border-color: #ff6b8b; }
    .pl__pw { position: relative; display: block; }
    .pl__pw button { position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%); border: 0; background: none; color: #6b7088; cursor: pointer; padding: 0.3rem; }
    .pl__hint { color: #b42318; font-size: 0.8rem; }
    .pl__go { margin-top: 1rem; padding: 0.8rem; border: 0; border-radius: 999px; background: #ff6b8b; color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
    .pl__go:hover { background: #f2507a; }
    .pl__go:disabled { opacity: 0.65; cursor: default; }
    .pl__links { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.2rem; font-size: 0.9rem; }
    .pl__links a { color: #6d28d9; text-decoration: none; font-weight: 600; }
    @media (max-width: 760px) { .pl { grid-template-columns: 1fr; } .pl__art { display: none; } }
  `]
})
export class PreSchoolLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  submit(): void {
    this.error.set(null);
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.submitting.set(true);
    this.auth.login({ ...this.form.getRawValue(), school: 'preschool' }).subscribe({
      next: response => {
        this.submitting.set(false);
        const user = response.data.user;
        if (user.mustChangePassword) { void this.router.navigate(['/change-password']); return; }

        // A SuperAdmin signing in here is taken to the PreSchool side, not their usual dashboard.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const landing = user.landingRoute.startsWith('/preschool') ? user.landingRoute : '/preschool/dashboard';
        void this.router.navigateByUrl(returnUrl ?? landing);
      },
      error: (e: unknown) => {
        this.submitting.set(false);
        this.error.set(this.describe(e));
        this.form.controls.password.reset();
      }
    });
  }

  private describe(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Sign-in failed. Please try again.';
    if (error.status === 0) return 'Cannot reach the server. Please try again in a moment.';
    const body = error.error as ApiResponse<unknown> | null;
    if (body?.errors?.length) return body.errors.join(' ');
    return body?.message ?? 'Sign-in failed. Please try again.';
  }
}
