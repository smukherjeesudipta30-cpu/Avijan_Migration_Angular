import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';

import { AboutPage, ContactRequest } from '../../core/models/about.model';
import { ApiResponse } from '../../core/models/api-response.model';
import { AboutService } from '../../core/services/about.service';
import { AuthService } from '../../core/services/auth.service';

/** One picture in the Portfolio strip, with the caption the legacy page used. */
interface PortfolioItem {
  readonly image: string;
  readonly caption: string;
}

/**
 * The public front page — the migration of `Views/About/Index.cshtml`
 * (the site at www.avijan.in) and `script/Routine.js`.
 *
 * Same sections in the same order as the legacy page: hero, admission banner,
 * About Us, Courses, Portfolio, Notice, class timing and Get In Touch. The
 * photographs are the original files, copied across unchanged.
 */
@Component({
  selector: 'app-home',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    TableModule,
    TextareaModule
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly about = inject(AboutService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly page = signal<AboutPage | null>(null);
  readonly loading = signal(true);
  readonly sending = signal(false);

  /** Signed-in visitors go to their own landing page instead of the login form. */
  readonly isSignedIn = computed(() => this.auth.isAuthenticated());
  readonly landingRoute = computed(() => this.auth.user()?.landingRoute ?? '/dashboard');

  /**
   * The nine portfolio pictures and captions, exactly as the legacy page listed
   * them. They are static content, so they live here rather than in the database
   * — the legacy page hard-coded them in the view too.
   */
  readonly portfolio: readonly PortfolioItem[] = [
    { image: '/images/1.jpeg', caption: "Teacher's Day" },
    { image: '/images/2.jpeg', caption: 'Student of the Year' },
    { image: '/images/3.jpeg', caption: 'Avijan Cricket Tournament 2023' },
    { image: '/images/7.jpeg', caption: 'Avijan Sandhya' },
    { image: '/images/5.jpeg', caption: 'Anindita Mukherjee' },
    { image: '/images/p-six.jpg', caption: 'Avijan Drawing Competition' },
    { image: '/images/image_advertisement.jpeg', caption: 'Avijan Campaigning' },
    { image: '/images/image_group.jpeg', caption: 'Avijan Class' },
    { image: '/images/Image_tournament.jpeg', caption: 'Avijan Cricket Tournament 2025' }
  ];

  /**
   * True when the visitor's system asks for reduced motion, in which case the
   * marquee does not animate.
   *
   * <p>Worth knowing: <b>Windows Server disables animations by default</b>, so a
   * browser on the server reports this as true and the strip sits still there
   * while scrolling perfectly well on an ordinary PC or phone.</p>
   */
  private readonly reducedMotion = signal(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /**
   * Doubled so the strip can scroll continuously without a visible seam.
   *
   * Only doubled when it actually animates: with the animation off the second
   * copy is not a seam-hider, it is nine duplicate photographs the visitor has to
   * scroll past.
   */
  readonly portfolioLoop = computed(() =>
    this.reducedMotion() ? [...this.portfolio] : [...this.portfolio, ...this.portfolio]);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    phone: ['', [Validators.pattern('^[0-9+\\-\\s]{6,20}$')]],
    message: ['', [Validators.required, Validators.maxLength(2000)]]
  });

  /** The lightbox the legacy page got by linking each thumbnail to its full image. */
  readonly lightbox = signal<PortfolioItem | null>(null);

  constructor() {
    this.about.getAboutPage().subscribe({
      next: page => {
        this.page.set(page);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  ngOnDestroy(): void {
    this.closeLightbox();
  }

  openLightbox(item: PortfolioItem): void {
    this.lightbox.set(item);
    document.body.style.overflow = 'hidden';
  }

  closeLightbox(): void {
    this.lightbox.set(null);
    document.body.style.overflow = '';
  }

  /** Smooth in-page navigation, replacing the legacy nav's `data-target` scroll. */
  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Name, a valid email address and a message are required.',
        life: 5000
      });
      return;
    }

    this.sending.set(true);

    const v = this.form.getRawValue();

    const request: ContactRequest = {
      name: v.name.trim(),
      email: v.email.trim(),
      phone: v.phone.trim() || undefined,
      message: v.message.trim()
    };

    this.about.submitContact(request).subscribe({
      next: response => {
        this.sending.set(false);
        this.form.reset({ name: '', email: '', phone: '', message: '' });
        this.messages.add({
          severity: 'success',
          summary: 'Message sent',
          detail: response.message ?? 'Thank you — we will be in touch.',
          life: 6000
        });
      },
      error: (error: unknown) => {
        this.sending.set(false);

        if (error instanceof HttpErrorResponse) {
          const body = error.error as ApiResponse<unknown> | null;
          const detail = body?.errors?.length ? body.errors.join(' ') : body?.message;

          this.messages.add({
            severity: 'error',
            summary: 'Could not send',
            detail: detail ?? 'Please try again in a moment.',
            life: 8000
          });
        }
      }
    });
  }
}
