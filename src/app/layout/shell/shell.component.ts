import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '../../core/services/auth.service';
import { LoadingService } from '../../core/services/loading.service';
import { MENU, MenuSection } from './menu';

@Component({
  selector: 'app-shell',
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ButtonModule,
    MenuModule,
    ProgressBarModule,
    TooltipModule
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly loading = inject(LoadingService);

  readonly user = this.auth.user;
  readonly isLoading = this.loading.isLoading;

  /* The sidebar is two different things at two widths, and conflating them is what
     made the phone layout unusable: on a wide screen it is a permanent column, on a
     narrow one it is an overlay drawer sitting on top of the page.

     The breakpoint is read from matchMedia rather than guessed, and it MUST match
     the 900px in shell.component.scss - the stylesheet decides when the sidebar
     turns into an overlay, so if the two disagree the drawer either starts open on
     top of the content or cannot be opened at all. */
  private static readonly MobileQuery = '(max-width: 900px)';

  private readonly mobile = window.matchMedia(ShellComponent.MobileQuery);

  readonly isMobile = signal(this.mobile.matches);

  /* Open by default on a wide screen, closed on a narrow one. Starting it open on a
     phone is what put the menu over the page on every load. */
  readonly sidebarOpen = signal(!this.mobile.matches);

  /** Only the sections this user can actually reach — a user may hold several roles. */
  readonly sections = computed<MenuSection[]>(() => {
    const held = this.user()?.roles ?? [];
    if (held.length === 0) {
      return [];
    }

    return MENU
      .map(section => ({
        ...section,
        items: section.items.filter(item => item.roles.some(role => held.includes(role)))
      }))
      .filter(section => section.items.length > 0);
  });

  readonly initials = computed(() => {
    const name = this.user()?.name?.trim();
    if (!name) {
      return '?';
    }

    return name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('');
  });

  readonly accountMenu: MenuItem[] = [
    { label: 'Signed in', disabled: true },
    { separator: true },
    { label: 'Sign out', icon: 'pi pi-sign-out', command: () => this.auth.logout() }
  ];

  constructor() {
    /* Rotating a phone, or dragging a desktop window narrow, changes which of the
       two layouts applies - so the open state has to be re-decided, not left at
       whatever it happened to be. */
    const onChange = (event: MediaQueryListEvent) => {
      this.isMobile.set(event.matches);
      this.sidebarOpen.set(!event.matches);
    };

    this.mobile.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => this.mobile.removeEventListener('change', onChange));
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(open => !open);
  }

  /**
   * Called when a navigation link is followed. On a phone the drawer covers the
   * page, so leaving it open after a tap means the user navigates and still cannot
   * see where they landed. On a wide screen the sidebar is not in the way, so it
   * stays put.
   */
  closeIfMobile(): void {
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }
  }

  /** Escape closes the drawer, the way any overlay is expected to behave. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeIfMobile();
  }
}
