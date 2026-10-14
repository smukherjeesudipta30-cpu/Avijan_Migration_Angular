import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, effect, inject, input, signal, untracked } from '@angular/core';

import { environment } from '../../environments/environment';

/**
 * A staff member's photo in a small circle — the User form photo, else their
 * Hierarchy chart photo (GET users/staff-photo); initials when there is neither.
 */
@Component({
  selector: 'app-staff-avatar',
  standalone: true,
  template: `
    <span class="sa" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.38">
      @if (url(); as u) { <img [src]="u" [alt]="name()" /> } @else { {{ initials() }} }
    </span>
  `,
  styles: [`
    .sa { display: inline-grid; place-items: center; border-radius: 50%; overflow: hidden; flex: 0 0 auto;
      background: linear-gradient(135deg, #ff9ec7, #8e2de2); color: #fff; font-weight: 700; vertical-align: middle; }
    .sa img { width: 100%; height: 100%; object-fit: cover; }
  `]
})
export class StaffAvatarComponent implements OnDestroy {
  private readonly http = inject(HttpClient);

  readonly loginId = input<string | null | undefined>(null);
  readonly name = input<string | null | undefined>('');
  readonly size = input(36);
  readonly url = signal<string | null>(null);

  constructor() {
    // Only loginId is tracked: setUrl reads url(), and tracking that made every
    // arriving photo re-run this effect, clear itself and fetch again, forever.
    effect(() => {
      const login = this.loginId()?.trim();
      untracked(() => this.setUrl(null));
      if (!login) return;
      this.http.get(`${environment.apiBaseUrl}/users/staff-photo`, { params: { loginId: login }, responseType: 'blob' })
        .subscribe({ next: b => { if (b?.size) this.setUrl(URL.createObjectURL(b)); }, error: () => {} });
    });
  }

  ngOnDestroy(): void {
    this.setUrl(null);
  }

  initials(): string {
    return (this.name() ?? '').trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  }

  private setUrl(url: string | null): void {
    const old = this.url();
    if (old) URL.revokeObjectURL(old);
    this.url.set(url);
  }
}
