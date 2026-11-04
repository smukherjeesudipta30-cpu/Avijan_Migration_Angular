import { Component, inject } from '@angular/core';

import { AuthService } from '../../../core/services/auth.service';

/**
 * Where a parent lands after signing in. Their child's fees, report cards and
 * certificate are added here in the later phases; until then it greets them
 * rather than leaving the sign-in looking broken.
 */
@Component({
  selector: 'app-preschool-parent',
  standalone: true,
  template: `
    <section class="psp">
      <span class="psp__art" aria-hidden="true">🧸</span>
      <h1>Welcome{{ name() ? ', ' + name() : '' }}</h1>
      <p>This is your Avijan PreSchool page. Your child's fee receipts, report cards and certificate will appear here soon.</p>
    </section>
  `,
  styles: [`
    .psp { max-width: 34rem; margin: 2rem auto; padding: 2rem 1.5rem; text-align: center; border-radius: 20px;
      background: linear-gradient(135deg, #ffe3ec, #e3f2ff); color: #2a2f45; }
    .psp__art { font-size: 3rem; }
    .psp h1 { margin: 0.5rem 0; font-size: 1.5rem; }
    .psp p { margin: 0.5rem 0 0; }
  `]
})
export class PreSchoolParentComponent {
  private readonly auth = inject(AuthService);

  name(): string {
    return this.auth.user()?.name?.split(' ')[0] ?? '';
  }
}
