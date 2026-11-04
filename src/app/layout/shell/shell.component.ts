import { CommonModule } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';

import { CallOverlayComponent } from '../../features/chat/call-overlay/call-overlay.component';
import { ChatPanelComponent } from '../../features/chat/chat-panel/chat-panel.component';
import { AuthService } from '../../core/services/auth.service';
import { ChatUiService } from '../../core/services/chat-ui.service';
import { FeaturesService } from '../../core/services/features.service';
import { LoadingService } from '../../core/services/loading.service';
import { ReportService } from '../../core/services/report.service';
import { ROLE_LABELS } from '../../core/models/auth.model';
import { MENU, MenuSection, School } from './menu';

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
    TooltipModule,
    ChatPanelComponent,
    CallOverlayComponent
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly features = inject(FeaturesService);
  private readonly loading = inject(LoadingService);
  private readonly router = inject(Router);
  readonly chatUi = inject(ChatUiService);
  private readonly reports = inject(ReportService);

  /** A signed-in student's own photo for the account circle; initials until (or unless) there is one. */
  readonly myPhotoUrl = signal<string | null>(null);
  private photoFor: string | null = null;

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

  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map(e => e.urlAfterRedirects)),
    { initialValue: this.router.url });

  /**
   * The school being worked in, read from the address: every PreSchool page
   * lives under /preschool. Taken from the URL rather than remembered, so a
   * bookmark or a link always opens in the right school.
   */
  readonly school = computed<School>(() => this.url().startsWith('/preschool') ? 'preschool' : 'computer');

  /** Only a SuperAdmin works in both schools, so only they get the switcher. */
  readonly canSwitchSchool = computed(() => (this.user()?.roles ?? []).includes('SuperAdmin'));

  readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] ?? role : '';
  });

  switchSchool(school: School): void {
    if (school === this.school()) return;
    void this.router.navigateByUrl(school === 'preschool' ? '/preschool/dashboard' : '/dashboard');
    this.closeIfMobile();
  }

  /** Only the sections this user can actually reach — a user may hold several roles. */
  readonly sections = computed<MenuSection[]>(() => {
    const held = this.user()?.roles ?? [];
    if (held.length === 0) {
      return [];
    }

    // SuperAdmin sees every screen in the drawer, not just what any one role's
    // item list happens to name — the same "above every role check" stance as
    // AuthService.hasAnyRole and the API's SuperAdminAuthorizationHandler.
    const isSuperAdmin = held.includes('SuperAdmin');
    const school = this.school();

    return MENU
      // Everyone else sees only their own school's sections already, through
      // the roles; a SuperAdmin holds every role, so the switcher decides.
      .filter(section => !isSuperAdmin || (section.school ?? 'computer') === school)
      .map(section => ({
        ...section,
        items: section.items.filter(item =>
          (isSuperAdmin || item.roles.some(role => held.includes(role)))
          // An entry tied to an optional feature stays hidden until it is switched
          // on server-side, so a half-finished feature never appears in the menu.
          && (!item.feature || this.features[item.feature]()))
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
    {
      label: 'Change Password',
      icon: 'pi pi-key',
      command: () => void this.router.navigateByUrl('/change-password')
    },
    { separator: true },
    { label: 'Sign out', icon: 'pi pi-sign-out', command: () => this.auth.logout() }
  ];

  constructor() {
    // Fetched once per signed-in student, from their own-photo route (the
    // office's photo endpoint is closed to students). Freed on sign-out.
    effect(() => {
      const user = this.user();
      const isStudent = !!user && (user.role === 'Student' || (user.roles ?? []).includes('Student'));
      const key = isStudent ? user!.email : null;
      if (key === this.photoFor) return;
      this.photoFor = key;
      const old = this.myPhotoUrl();
      if (old) URL.revokeObjectURL(old);
      this.myPhotoUrl.set(null);
      if (!key) return;
      this.reports.myPhoto().subscribe({
        next: blob => { if (this.photoFor === key && blob.size) this.myPhotoUrl.set(URL.createObjectURL(blob)); },
        error: () => { /* no photo on file: the initials stay */ }
      });
    });

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
