import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';

import { FeaturesService } from './core/services/features.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule],
  template: `
    <p-toast position="top-right" />
    <router-outlet />
  `,
  styles: [':host { display: block; min-height: 100vh; }']
})
export class AppComponent {
  private readonly features = inject(FeaturesService);

  constructor() {
    // Asked once at start-up, so the menu knows what to show before the first
    // navigation. Anything not yet answered counts as off.
    this.features.load();
  }
}
