import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { AboutPage } from '../../core/models/about.model';
import { ApiResponse } from '../../core/models/api-response.model';
import { AboutService } from '../../core/services/about.service';
import { AuthService } from '../../core/services/auth.service';

/**
 * Public About Us page — replaces `Views/About/Index.cshtml`. Anonymous: the
 * copy comes from the API's InstituteProfile config and the stats are live.
 * The contact form writes one `dbo.CusMessage` row (MIGRATION_PLAN §4.7 N4).
 */
@Component({
  selector: 'app-about',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    InputTextModule,
    TextareaModule,
    TagModule,
    SkeletonModule
  ],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss'
})
export class AboutComponent {
  private readonly fb = inject(FormBuilder);
  private readonly about = inject(AboutService);
  private readonly messages = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly page = signal<AboutPage | null>(null);
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly year = new Date().getFullYear();

  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly landingRoute = () => this.auth.user()?.landingRoute ?? '/dashboard';

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    phone: [''],
    message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]]
  });

  get name() { return this.form.controls.name; }
  get email() { return this.form.controls.email; }
  get message() { return this.form.controls.message; }

  constructor() {
    this.about.getAboutPage().subscribe({
      next: data => {
        this.page.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.sending.set(true);

    this.about.submitContact(this.form.getRawValue()).subscribe({
      next: response => {
        this.sending.set(false);
        this.sent.set(true);
        this.form.reset();
        this.messages.add({
          severity: 'success',
          summary: 'Message sent',
          detail: response.message ?? 'Thank you — we will be in touch.',
          life: 6000
        });
      },
      error: (error: unknown) => {
        this.sending.set(false);

        // 429 is an expected outcome on a public form, not a failure to report twice.
        if (error instanceof HttpErrorResponse && error.status === 429) {
          const body = error.error as ApiResponse<unknown> | null;
          this.messages.add({
            severity: 'info',
            summary: 'Already received',
            detail: body?.message ?? 'Please wait a few minutes before sending another message.',
            life: 6000
          });
        }
      }
    });
  }

  durationLabel(months?: number): string {
    if (!months) {
      return 'Flexible';
    }

    if (months % 12 === 0) {
      const years = months / 12;
      return years === 1 ? '1 year' : `${years} years`;
    }

    return `${months} months`;
  }
}
