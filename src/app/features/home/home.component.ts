import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';

import { AboutCourse, AboutPage, ContactDetails, ContactRequest } from '../../core/models/about.model';
import { ApiResponse } from '../../core/models/api-response.model';
import { AboutService } from '../../core/services/about.service';
import { AuthService } from '../../core/services/auth.service';
import { CompetitionPublic } from '../../core/models/competition.model';
import { CompetitionService } from '../../core/services/competition.service';
import { FeaturesService } from '../../core/services/features.service';
import { environment } from '../../../environments/environment';

/** One picture in the Portfolio strip, with the caption the legacy page used. */
interface PortfolioItem {
  readonly image: string;
  readonly caption: string;
}

/** One tile in the holiday notice: a closure, or a run of back-to-back ones. */
interface ClosureGroup {
  key: string;
  name: string;
  days: number;
  /** "19" or "19–21". */
  dayLabel: string;
  monthShort: string;
  /** "Saturday" or "Mon – Wed". */
  weekdays: string;
  state: 'past' | 'today' | 'next' | 'later';
  /** "Tomorrow" / "In 5 days" — shown on the next closure only. */
  away: string;
}

/**
 * Merges back-to-back closed days into one tile (Durga Puja's Ashtami to
 * Dashami reads as "19–21", not three tiles), and marks each as over, today,
 * the next one coming, or later.
 */
function groupClosures(days: { date: string; name: string }[]): ClosureGroup[] {
  const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86_400_000;

  /** "Durga Puja (Maha Ashtami)" and "Additional Durga Puja holiday" both give "durga puja". */
  const base = (n: string) => n.replace(/\s*\(.*\)\s*$/, '').replace(/^additional\s+/i, '')
    .replace(/\s+holiday$/i, '').trim().toLowerCase();
  const runs: { start: Date; end: Date; names: string[]; count: number }[] = [];
  for (const d of days) {
    const date = parse(d.date);
    const last = runs[runs.length - 1];
    const gap = last ? Math.round((date.getTime() - last.end.getTime()) / dayMs) : 0;
    // Back to back, or the same festival carrying on after a Sunday in between
    // (Durga Puja: Saturday's Shashthi, then Monday's Ashtami to Dashami).
    const sundayBetween = gap === 2 && new Date(last!.end.getTime() + dayMs).getDay() === 0
      && last!.names.some(n => base(n) === base(d.name));
    if (last && (gap <= 1 || sundayBetween)) {
      if (gap > 0) last.count++;
      last.end = date;
      if (!last.names.includes(d.name)) last.names.push(d.name);
    } else {
      runs.push({ start: date, end: date, names: [d.name], count: 1 });
    }
  }

  // One short title per tile however Admin named the days: the phrase most of
  // them share ("Durga Puja" across Maha Shashthi … Dashami, "Additional Durga
  // Puja holiday" and so on), weighted by length so "Puja" alone never wins.
  const title = (names: string[]) => {
    if (names.length === 1) return names[0];
    const lower = names.map(n => n.toLowerCase());
    let best = names[0].replace(/\s*\(.*\)\s*$/, '').trim();
    let bestScore = 0;
    for (const n of names) {
      const cand = n.replace(/\s*\(.*\)\s*$/, '').replace(/^additional\s+/i, '').replace(/\s+holiday$/i, '').trim();
      const score = lower.filter(l => l.includes(cand.toLowerCase())).length * cand.length;
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    return best;
  };

  const weekday = (d: Date, style: 'long' | 'short') => d.toLocaleDateString('en-IN', { weekday: style });
  let nextMarked = false;

  return runs.map(r => {
    const start = r.start.getTime();
    const end = r.end.getTime();
    const single = start === end;

    let state: ClosureGroup['state'] = 'later';
    if (end < today) state = 'past';
    else if (start <= today) state = 'today';
    else if (!nextMarked) state = 'next';
    if (state === 'today' || state === 'next') nextMarked = true;

    const daysAway = Math.round((start - today) / dayMs);
    return {
      key: r.start.toISOString(),
      name: title(r.names),
      days: r.count,
      dayLabel: single ? `${r.start.getDate()}` : `${r.start.getDate()}–${r.end.getDate()}`,
      monthShort: r.start.toLocaleDateString('en-IN', { month: 'short' }),
      weekdays: single ? weekday(r.start, 'long') : `${weekday(r.start, 'short')} – ${weekday(r.end, 'short')} · ${r.count} days closed`,
      state,
      away: daysAway === 1 ? 'Tomorrow' : `In ${daysAway} days`
    };
  });
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
  private readonly competitions = inject(CompetitionService);

  /** The competition banner is shown only once the portal is switched on. */
  protected readonly features = inject(FeaturesService);

  /** The current competition, for the banner. Null when none is set up. */
  readonly competition = signal<CompetitionPublic | null>(null);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  readonly page = signal<AboutPage | null>(null);
  readonly loading = signal(true);
  readonly sending = signal(false);

  /**
   * The Contact Details box must never come up simply blank — this is the one
   * place a visitor finds out how to reach the institute at all, so it falls
   * back to the same address the server itself is configured with
   * (`appsettings.json` InstituteProfile:Contact) the moment `getAboutPage()`
   * hasn't answered yet, is slow, or fails outright. Kept in sync with that
   * config by hand; it changes about as often as the institute moves.
   */
  readonly fallbackContact: ContactDetails = {
    addressLine1: '53, Aghore Sarani, Rajpur',
    addressLine2: 'Kol-149',
    phone: '+91-7688045949',
    email: 'mail.avijan@gmail.com',
    officeHours: ''
  };

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

  /**
   * A small fixed palette for the course cards, cycled by position.
   *
   * <p>Not tied to the course itself — a course has no colour of its own in the
   * database, and picking one from its name would shift every time a course is
   * renamed. Cycling by position is stable and still gives every card on the page
   * a different colour.</p>
   */
  private static readonly coursePalette: readonly string[] = [
    '#2f6fed', '#e0574a', '#1fa97c', '#e0a51f', '#7c5ce0', '#d64d9c', '#1f9bd6', '#e0862f'
  ];

  protected courseColor(index: number): string {
    return HomeComponent.coursePalette[index % HomeComponent.coursePalette.length];
  }

  /** Up to two letters for the icon tile, the way an app icon abbreviates a name. */
  protected courseInitials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0]!.toUpperCase())
      .join('');
  }

  /**
   * Which heading a course sits under, and the single letter its icon tile shows.
   *
   * <p>Read off the course name rather than a stored category, because that is all
   * that exists — the 48 rows are a flat list with no grouping field, and the
   * pattern in every name ("DIPLOMA IN …", "CERTIFICATE IN …") already says which
   * kind of course it is. The letters follow what was asked for directly: D for
   * Diploma, C for Certification; the remaining groups (Specialisation, Foundation,
   * Junior &amp; Kids) get the same one-letter treatment for consistency, and
   * anything that fits none of the patterns — BCA, HSCA/HSCS, ABACUS, Nutrition —
   * falls back to its own initials rather than being forced into a group it isn't
   * really part of.</p>
   */
  private static classify(name: string): { group: string; badge: string } {
    const upper = name.toUpperCase();

    if (upper.startsWith('DIPLOMA')) return { group: 'Diploma Courses', badge: 'D' };
    if (upper.startsWith('CERTIFICATE')) return { group: 'Certificate Courses', badge: 'C' };
    if (upper.startsWith('SPECIALIZATION') || upper.startsWith('SPECIALISATION')) {
      return { group: 'Specialisation Courses', badge: 'S' };
    }
    if (upper.startsWith('BEGINNERS IN INFORMATION TECHNOLOGY')) {
      return { group: 'Foundation Courses', badge: 'F' };
    }
    if (upper.startsWith('COMPUTER KNOWLEDGE FOR KIDS') || upper.startsWith('JUNIOR')) {
      return { group: 'Junior & Kids Courses', badge: 'K' };
    }
    if (upper.startsWith('BACHELOR OF') || upper.startsWith('HIGHER SECONDARY')) {
      return { group: 'Degree & Higher Secondary', badge: '' };
    }

    return { group: 'Other Courses', badge: '' };
  }

  /** Reading order for the groups above — a rough beginner-to-advanced path. */
  private static readonly groupOrder = [
    'Foundation Courses', 'Certificate Courses', 'Diploma Courses',
    'Specialisation Courses', 'Degree & Higher Secondary', 'Junior & Kids Courses',
    'Other Courses'
  ];

  /** The 48 courses split into named groups, in a fixed reading order. */
  protected readonly courseGroups = computed(() => {
    const courses = this.page()?.courses ?? [];
    const byGroup = new Map<string, AboutCourse[]>();

    for (const course of courses) {
      const { group } = HomeComponent.classify(course.name);
      (byGroup.get(group) ?? byGroup.set(group, []).get(group)!).push(course);
    }

    return HomeComponent.groupOrder
      .map(group => ({ group, courses: byGroup.get(group) ?? [] }))
      .filter(g => g.courses.length > 0);
  });

  /** The tile letter for a course — its group's letter, or its own initials. */
  protected courseBadge(name: string): string {
    const { badge } = HomeComponent.classify(name);
    return badge || this.courseInitials(name);
  }

  /**
   * The ten most-enrolled courses, for the popularity chart. Capped at ten because
   * a bar for every one of the 48 courses would be too short to read a label
   * against; courses with nobody currently on them are left off rather than shown
   * as an empty bar.
   */
  protected readonly popularCourses = computed(() =>
    [...(this.page()?.courses ?? [])]
      .filter(c => c.enrolledCount > 0)
      .sort((a, b) => b.enrolledCount - a.enrolledCount)
      .slice(0, 10));

  protected enrolmentPercent(count: number): number {
    const highest = Math.max(1, ...this.popularCourses().map(c => c.enrolledCount));
    return Math.max(6, Math.round((count / highest) * 100));
  }

  /**
   * How far the duration bar fills, relative to the longest course currently on the
   * page — so the bars compare courses to each other rather than to an arbitrary
   * fixed ceiling that would make every course look short once one long diploma is
   * added.
   */
  protected durationPercent(months: number): number {
    const longest = Math.max(
      1, ...(this.page()?.courses.map(c => c.durationMonths ?? 0) ?? [0]));

    return Math.max(8, Math.round((months / longest) * 100));
  }

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(200)]],
    phone: ['', [Validators.pattern('^[0-9+\\-\\s]{6,20}$')]],
    message: ['', [Validators.required, Validators.maxLength(2000)]]
  });

  /* --------------------------------------------------- institute closed */

  private readonly http = inject(HttpClient);

  /** "October 2026" — the month the holiday notice covers. */
  readonly monthTitle = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  /** This month's closures, back-to-back days merged; null until the list answers. */
  readonly closures = signal<ClosureGroup[] | null>(null);
  readonly closedDayCount = computed(() => (this.closures() ?? []).reduce((n, g) => n + g.days, 0));

  private loadClosures(): void {
    this.http.get<ApiResponse<{ date: string; name: string }[]>>(`${environment.apiBaseUrl}/holidays/this-month`)
      .subscribe({
        next: r => this.closures.set(groupClosures(r.data ?? [])),
        // An older API without the endpoint: leave the notice off rather than show it empty.
        error: () => this.closures.set(null)
      });
  }

  /** The lightbox the legacy page got by linking each thumbnail to its full image. */
  readonly lightbox = signal<PortfolioItem | null>(null);

  constructor() {
    this.loadClosures();

    this.about.getAboutPage().subscribe({
      next: page => {
        this.page.set(page);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });

    /* The competition banner. Asked for unconditionally rather than behind the
       feature flag, because the flag arrives asynchronously too and the banner is
       hidden in the template until both have answered — an older API with no such
       endpoint simply leaves it null and nothing is shown. */
    this.competitions.publicNotice().subscribe({
      next: competition => this.competition.set(competition),
      error: () => this.competition.set(null)
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
