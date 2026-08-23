import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
  readonly sidebarOpen = signal(true);

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

  toggleSidebar(): void {
    this.sidebarOpen.update(open => !open);
  }
}
