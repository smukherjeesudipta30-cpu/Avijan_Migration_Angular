import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { ToastModule } from 'primeng/toast';

import { GuestWidgetComponent } from './features/chat/guest-widget/guest-widget.component';
import { AuthService } from './core/services/auth.service';
import { FeaturesService } from './core/services/features.service';
import { SiteVisitService } from './core/services/site-visit.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, ToastModule, GuestWidgetComponent],
  template: `
    <p-toast position="top-right" />
    <router-outlet />

    <!-- The anonymous chat bubble: shown to a visitor who has not signed in.
         A signed-in user has the internal chat panel in the shell instead.
         Not on the PreSchool's pages: the bubble reaches the Computer Centre's
         front desk, and the PreSchool has its own enquiry form and phones. -->
    @if (!auth.isAuthenticated() && !onPreSchool()) {
      <app-guest-chat-widget />
    }
  `,
  styles: [':host { display: block; min-height: 100vh; }']
})
export class AppComponent {
  private readonly features = inject(FeaturesService);
  readonly auth = inject(AuthService);
  private readonly visits = inject(SiteVisitService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map(e => e.urlAfterRedirects)),
    { initialValue: this.router.url });

  /** On an Avijan PreSchool page (its public page, sign-in or staff pages). */
  readonly onPreSchool = computed(() => this.url().startsWith('/preschool'));

  constructor() {
    // Asked once at start-up, so the menu knows what to show before the first
    // navigation. Anything not yet answered counts as off.
    this.features.load();

    // Visits to the public pages, for Admin's "Website visitors" report.
    this.visits.start(this.router, 'Web');
  }
}
