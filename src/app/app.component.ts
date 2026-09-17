import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';

import { GuestWidgetComponent } from './features/chat/guest-widget/guest-widget.component';
import { AuthService } from './core/services/auth.service';
import { FeaturesService } from './core/services/features.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, ToastModule, GuestWidgetComponent],
  template: `
    <p-toast position="top-right" />
    <router-outlet />

    <!-- The anonymous chat bubble: shown to a visitor who has not signed in.
         A signed-in user has the internal chat panel in the shell instead. -->
    @if (!auth.isAuthenticated()) {
      <app-guest-chat-widget />
    }
  `,
  styles: [':host { display: block; min-height: 100vh; }']
})
export class AppComponent {
  private readonly features = inject(FeaturesService);
  readonly auth = inject(AuthService);

  constructor() {
    // Asked once at start-up, so the menu knows what to show before the first
    // navigation. Anything not yet answered counts as off.
    this.features.load();
  }
}
