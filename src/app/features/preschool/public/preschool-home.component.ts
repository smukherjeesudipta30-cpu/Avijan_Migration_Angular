import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { PreSchoolEnquirySave, PreSchoolPublic, ageLabel, isComingSoon } from '../../../core/models/preschool.model';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { SchoolTabsComponent } from '../../../shared/school-tabs/school-tabs.component';

/** One colour per class card, in class order; repeats after four. */
const CLASS_THEMES = [
  { bg: '#ffe3ec', ink: '#b3264f', art: '🐣' },
  { bg: '#e3f2ff', ink: '#1d5fa8', art: '🧸' },
  { bg: '#e6f8e6', ink: '#2b7a2b', art: '🌱' },
  { bg: '#fff1d6', ink: '#9a5b00', art: '🚀' }
];

const emptyEnquiry = (): PreSchoolEnquirySave => ({
  childName: '', childDateOfBirth: null, parentName: '', phone: '', email: null, classWanted: null, message: null
});

/**
 * Avijan PreSchool's public home page at /preschool. Everything on it comes
 * from the PreSchool admin's own settings and classes, so the page is right
 * the moment they change a fee or the address.
 */
@Component({
  selector: 'app-preschool-home',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, SchoolTabsComponent],
  template: `
    <app-school-tabs current="preschool" />

    <header class="ph__bar">
      <a routerLink="/preschool" class="ph__brand">
        <span class="ph__brand-mark" aria-hidden="true">A</span>
        <span><strong>Avijan</strong> PreSchool</span>
      </a>
      <div class="ph__bar-links">
        <a href="#classes" (click)="go($event, 'classes')">Classes</a>
        <a href="#day" (click)="go($event, 'day')">Our day</a>
        <a href="#enquire" (click)="go($event, 'enquire')">Admission</a>
        <a href="#contact" (click)="go($event, 'contact')">Contact</a>
        <a [routerLink]="signedIn() ? landing() : '/login'" class="ph__login">{{ signedIn() ? 'My page' : 'Login' }}</a>
      </div>
    </header>

    <section class="ph__hero">
      <div class="ph__hero-text">
        <span class="ph__pill">Pre-Nursery · Nursery · KG-1 · KG-2</span>
        @if (comingSoon()) {
          <p class="ph__soon"><span aria-hidden="true">🎉</span> Our Champahati centre is coming soon@if (info()?.opensOn; as d) {, opening on <strong>{{ d | date: 'd MMMM y' }}</strong>}. Admissions are open now.</p>
        }
        <h1>Little steps,<br /><span>big smiles.</span></h1>
        <p>A warm, safe and happy place for your child's first school years, at Champahati.
          Learning through play, stories, rhymes and colours.</p>
        <div class="ph__hero-cta">
          <a href="#enquire" class="ph__btn ph__btn--main" (click)="go($event, 'enquire')">Ask about admission</a>
          @if (info()?.phone; as phone) {
            <a [href]="'tel:' + phone" class="ph__btn">📞 {{ phone }}</a>
          }
        </div>
      </div>
      <div class="ph__hero-art" aria-hidden="true">
        <span class="ph__bubble ph__bubble--1">🎨</span>
        <span class="ph__bubble ph__bubble--2">📚</span>
        <span class="ph__bubble ph__bubble--3">🧩</span>
        <span class="ph__bubble ph__bubble--4">🎵</span>
        <span class="ph__sun">☀️</span>
      </div>
    </section>

    <section class="ph__section" id="classes">
      <h2>Our classes</h2>
      <p class="ph__lead">Admissions are open all year. Ask us about fees and seats in each class.</p>
      <div class="ph__classes">
        @for (c of info()?.classes ?? []; track c.name; let i = $index) {
          <article class="ph__class" [style.background]="theme(i).bg">
            <span class="ph__class-art" aria-hidden="true">{{ theme(i).art }}</span>
            <h3 [style.color]="theme(i).ink">{{ c.name }}</h3>
            @if (ageRange(c.minAgeMonths, c.maxAgeMonths); as age) { <p class="ph__age">Age {{ age }}</p> }
            @if (c.subjects.length) {
              <ul class="ph__subjects">
                @for (s of c.subjects; track s) { <li>{{ s }}</li> }
              </ul>
            }
          </article>
        }
      </div>
    </section>

    <section class="ph__section ph__why">
      <h2>Why parents choose us</h2>
      <div class="ph__why-grid">
        <div><span aria-hidden="true">🤗</span><h3>Caring teachers</h3><p>Every child is known by name and looked after with patience.</p></div>
        <div><span aria-hidden="true">🧸</span><h3>Learning through play</h3><p>Rhymes, stories, games and art build early reading and numbers.</p></div>
        <div><span aria-hidden="true">🏠</span><h3>Safe and clean</h3><p>Bright, clean classrooms where little ones feel at home.</p></div>
        <div><span aria-hidden="true">📝</span><h3>Regular report cards</h3><p>Marks and grades after every exam, so you see your child grow.</p></div>
      </div>
    </section>

    <section class="ph__section" id="day">
      <h2>A day at school</h2>
      <ol class="ph__day">
        <li><span aria-hidden="true">👋</span>Welcome and prayer</li>
        <li><span aria-hidden="true">🎶</span>Rhymes and stories</li>
        <li><span aria-hidden="true">🔤</span>Letters and numbers</li>
        <li><span aria-hidden="true">🍎</span>Tiffin time</li>
        <li><span aria-hidden="true">🖍️</span>Drawing and craft</li>
        <li><span aria-hidden="true">⚽</span>Play time</li>
        <li><span aria-hidden="true">🏡</span>Home time</li>
      </ol>
    </section>

    @if (info()?.holidays?.length) {
      <section class="ph__section" id="holidays">
        <h2>Holiday notices</h2>
        <ul class="ph__holidays">
          @for (h of info()!.holidays; track h.id) {
            <li>
              <span class="ph__hdate">{{ h.fromDate | date: 'd MMM' }}@if (h.toDate !== h.fromDate) { – {{ h.toDate | date: 'd MMM' }}}</span>
              <span><strong>{{ h.title }}</strong>@if (h.note) { · {{ h.note }}}</span>
            </li>
          }
        </ul>
      </section>
    }

    @if (info()?.uniformShopName; as shop) {
      <section class="ph__section">
        <div class="ph__shop">
          <span class="ph__shop-art" aria-hidden="true">👕</span>
          <div>
            <h2>School uniform</h2>
            <p>We recommend <strong>{{ shop }}</strong>@if (info()?.uniformShopAddress; as a) {, {{ a }}}.</p>
            <div class="ph__shop-links">
              @if (info()?.uniformShopPhone; as p) { <a [href]="'tel:' + p">📞 {{ p }}</a> }
              @if (info()?.uniformShopMapUrl; as m) { <a [href]="m" target="_blank" rel="noopener">📍 Directions</a> }
            </div>
          </div>
        </div>
      </section>
    }

    <section class="ph__section" id="enquire">
      <div class="ph__enquire">
        <div class="ph__enquire-text">
          <h2>Ask about admission</h2>
          <p>Admissions are open all year. Leave your details and the school will call you back.</p>
          <span class="ph__enquire-art" aria-hidden="true">🎒</span>
        </div>
        @if (sent()) {
          <div class="ph__thanks" role="status">
            <span aria-hidden="true">🎉</span>
            <h3>Thank you!</h3>
            <p>{{ sent() }}</p>
            <button type="button" class="ph__btn" (click)="sent.set(null)">Send another</button>
          </div>
        } @else {
          <form class="ph__form" (ngSubmit)="send()" novalidate>
            <label>Child's name * <input name="child" [(ngModel)]="form.childName" maxlength="100" required /></label>
            <label>Child's date of birth <input name="dob" type="date" [(ngModel)]="form.childDateOfBirth" /></label>
            <label>Parent's name * <input name="parent" [(ngModel)]="form.parentName" maxlength="100" required /></label>
            <label>Phone * <input name="phone" type="tel" [(ngModel)]="form.phone" maxlength="15" placeholder="98300 00000" required /></label>
            <label>Email <input name="email" type="email" [(ngModel)]="form.email" maxlength="150" /></label>
            <label>Class
              <select name="class" [(ngModel)]="form.classWanted">
                <option [ngValue]="null">Not sure yet</option>
                @for (c of info()?.classes ?? []; track c.name) { <option [ngValue]="c.name">{{ c.name }}</option> }
              </select>
            </label>
            <label class="ph__wide">Message <textarea name="msg" rows="3" [(ngModel)]="form.message" maxlength="1000"></textarea></label>
            @if (error()) { <p class="ph__error ph__wide" role="alert">{{ error() }}</p> }
            <button type="submit" class="ph__btn ph__btn--main ph__wide" [disabled]="sending()">
              {{ sending() ? 'Sending…' : 'Send enquiry' }}
            </button>
          </form>
        }
      </div>
    </section>

    <footer class="ph__footer" id="contact">
      <div>
        <h2>{{ info()?.schoolName ?? 'Avijan PreSchool' }}</h2>
        <p>An Avijan Computer Centre school</p>
      </div>
      <div class="ph__contact">
        @if (info()?.address; as a) { <p>📍 {{ a }}</p> }
        @if (info()?.phone; as p) { <p><a [href]="'tel:' + p">📞 {{ p }}</a></p> }
        @if (info()?.email; as e) { <p><a [href]="'mailto:' + e">✉️ {{ e }}</a></p> }
        @if (info()?.mapUrl; as m) { <p><a [href]="m" target="_blank" rel="noopener">🗺️ Get directions</a></p> }
      </div>
      <div class="ph__foot-links">
        <a routerLink="/">Avijan Computer Centre</a>
        <a routerLink="/privacy">Privacy</a>
        <a routerLink="/login">Login</a>
      </div>
    </footer>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #fffaf3; color: #2a2f45;
      font-family: 'Nunito', 'Segoe UI', system-ui, sans-serif; }
    a { color: inherit; }
    .ph__bar { position: sticky; top: 0; z-index: 20; display: flex; justify-content: space-between; align-items: center; gap: 1rem;
      flex-wrap: wrap; max-width: 1150px; margin: 0 auto; padding: 0.8rem 1.25rem; background: #fffaf3; }
    .ph__brand { display: flex; align-items: center; gap: 0.55rem; text-decoration: none; font-size: 1.15rem; }
    .ph__brand-mark { display: grid; place-items: center; width: 2.2rem; height: 2.2rem; border-radius: 12px;
      background: #ff6b8b; color: #fff; font-weight: 800; transform: rotate(-6deg); }
    .ph__bar-links { display: flex; gap: 1.1rem; align-items: center; flex-wrap: wrap; font-weight: 600; font-size: 0.95rem; }
    .ph__bar-links a { text-decoration: none; }
    .ph__bar-links a:hover { color: #ff6b8b; }
    .ph__login { padding: 0.4rem 1rem; border-radius: 999px; border: 2px solid #2a2f45; }
    .ph__hero { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 2rem; align-items: center; max-width: 1150px;
      margin: 0 auto; padding: 2.5rem 1.25rem 3rem; }
    .ph__pill { display: inline-block; padding: 0.3rem 0.9rem; border-radius: 999px; background: #ffe3ec; color: #b3264f;
      font-weight: 700; font-size: 0.85rem; }
    .ph__soon { display: table; margin: 0.8rem 0 0; padding: 0.45rem 0.9rem;
      border-radius: 14px; background: #fff1d6; color: #7a4a00; font-weight: 600; font-size: 0.95rem; }
    .ph__holidays { list-style: none; padding: 0; margin: 1.2rem auto 0; max-width: 40rem; display: flex; flex-direction: column; gap: 0.6rem; }
    .ph__holidays li { display: flex; gap: 1rem; align-items: baseline; padding: 0.8rem 1.1rem; border-radius: 16px; background: #fff;
      border: 2px dashed #c9e4ff; }
    .ph__hdate { min-width: 7rem; font-weight: 800; color: #1d5fa8; }
    .ph__hero h1 { margin: 0.9rem 0; font-size: clamp(2.3rem, 5vw, 3.6rem); line-height: 1.05; letter-spacing: -0.02em; }
    .ph__hero h1 span { color: #ff6b8b; }
    .ph__hero p { font-size: 1.1rem; line-height: 1.6; max-width: 32rem; color: #4a5068; }
    .ph__hero-cta { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.4rem; }
    .ph__btn { display: inline-block; padding: 0.75rem 1.4rem; border-radius: 999px; border: 2px solid #2a2f45; background: #fff;
      color: #2a2f45; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
    .ph__btn--main { background: #ff6b8b; border-color: #ff6b8b; color: #fff; }
    .ph__btn--main:hover { background: #f2507a; }
    .ph__btn:disabled { opacity: 0.6; cursor: default; }
    .ph__hero-art { position: relative; height: 20rem; border-radius: 40% 60% 55% 45% / 50% 45% 55% 50%;
      background: radial-gradient(circle at 30% 30%, #ffd6e7, #d9ecff 60%, #e2f7dc); }
    .ph__bubble { position: absolute; display: grid; place-items: center; width: 4.5rem; height: 4.5rem; border-radius: 50%;
      background: #fff; font-size: 2.2rem; box-shadow: 0 8px 20px rgba(42, 47, 69, 0.1); animation: ph-float 5s ease-in-out infinite; }
    .ph__bubble--1 { top: 12%; left: 12%; }
    .ph__bubble--2 { top: 20%; right: 12%; animation-delay: -1.2s; }
    .ph__bubble--3 { bottom: 14%; left: 22%; animation-delay: -2.4s; }
    .ph__bubble--4 { bottom: 20%; right: 20%; animation-delay: -3.6s; }
    .ph__sun { position: absolute; top: 40%; left: 42%; font-size: 3.4rem; }
    @keyframes ph-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @media (prefers-reduced-motion: reduce) { .ph__bubble { animation: none; } }
    .ph__section { max-width: 1150px; margin: 0 auto; padding: 2.5rem 1.25rem; }
    .ph__section > h2, .ph__why h2 { margin: 0 0 0.4rem; font-size: 2rem; text-align: center; }
    .ph__lead { text-align: center; color: #5b6178; margin: 0 0 1.6rem; }
    .ph__classes { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1.1rem; }
    .ph__class { position: relative; padding: 1.4rem; border-radius: 24px; }
    .ph__class-art { position: absolute; top: 1rem; right: 1.1rem; font-size: 2.2rem; }
    .ph__class h3 { margin: 0; font-size: 1.5rem; }
    .ph__age { margin: 0.2rem 0 0; font-weight: 600; color: #5b6178; }
    .ph__subjects { display: flex; flex-wrap: wrap; gap: 0.35rem; list-style: none; margin: 0.9rem 0 0; padding: 0; }
    .ph__subjects li { padding: 0.2rem 0.6rem; border-radius: 999px; background: rgba(255, 255, 255, 0.75); font-size: 0.8rem; font-weight: 600; }
    .ph__why { background: #fff; border-radius: 32px; }
    .ph__why-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1.2rem; margin-top: 1.5rem; }
    .ph__why-grid div { text-align: center; padding: 1rem; }
    .ph__why-grid span { font-size: 2.6rem; }
    .ph__why-grid h3 { margin: 0.4rem 0 0.3rem; }
    .ph__why-grid p { margin: 0; color: #5b6178; line-height: 1.5; }
    .ph__day { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.75rem; list-style: none; padding: 0; margin: 1.5rem 0 0; }
    .ph__day li { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 1.1rem; border-radius: 999px; background: #fff;
      border: 2px dashed #ffc2d1; font-weight: 700; }
    .ph__day span { font-size: 1.4rem; }
    .ph__shop { display: flex; gap: 1.2rem; align-items: center; padding: 1.5rem; border-radius: 24px; background: #e3f2ff; }
    .ph__shop h2 { margin: 0; font-size: 1.5rem; text-align: left; }
    .ph__shop p { margin: 0.3rem 0 0; }
    .ph__shop-art { font-size: 3rem; }
    .ph__shop-links { display: flex; gap: 1rem; margin-top: 0.5rem; font-weight: 700; }
    .ph__enquire { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 2rem; padding: 2rem; border-radius: 32px; background: #fff;
      box-shadow: 0 10px 30px rgba(42, 47, 69, 0.06); }
    .ph__enquire-text h2 { margin: 0 0 0.6rem; font-size: 2rem; }
    .ph__enquire-text p { color: #5b6178; line-height: 1.6; }
    .ph__enquire-art { font-size: 5rem; }
    .ph__form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
    .ph__form label { display: flex; flex-direction: column; gap: 0.3rem; font-weight: 700; font-size: 0.9rem; }
    .ph__form input, .ph__form select, .ph__form textarea { padding: 0.65rem 0.8rem; border: 2px solid #e6e1d8; border-radius: 14px;
      font: inherit; font-weight: 400; background: #fffdf9; }
    .ph__form input:focus, .ph__form select:focus, .ph__form textarea:focus { outline: none; border-color: #ff6b8b; }
    .ph__wide { grid-column: 1 / -1; }
    .ph__error { margin: 0; color: #b42318; font-weight: 600; }
    .ph__thanks { text-align: center; align-self: center; }
    .ph__thanks span { font-size: 3rem; }
    .ph__thanks h3 { margin: 0.3rem 0; font-size: 1.5rem; }
    .ph__footer { display: grid; grid-template-columns: 1fr 1fr auto; gap: 1.5rem; max-width: 1150px; margin: 2rem auto 0;
      padding: 2rem 1.25rem; border-top: 2px dashed #ffc2d1; }
    .ph__footer h2 { margin: 0; }
    .ph__footer p { margin: 0.25rem 0; }
    .ph__footer a { text-decoration: none; }
    .ph__foot-links { display: flex; flex-direction: column; gap: 0.4rem; font-weight: 700; }
    @media (max-width: 820px) {
      .ph__hero, .ph__enquire, .ph__footer { grid-template-columns: 1fr; }
      .ph__hero-art { height: 14rem; }
      .ph__bar-links a:not(.ph__login) { display: none; }
      .ph__form { grid-template-columns: 1fr; }
      .ph__enquire-art { display: none; }
    }
  `]
})
export class PreSchoolHomeComponent implements OnInit {
  private readonly preschool = inject(PreSchoolService);
  private readonly auth = inject(AuthService);

  readonly info = signal<PreSchoolPublic | null>(null);
  readonly sending = signal(false);
  readonly sent = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly comingSoon = computed(() => !!this.info() && isComingSoon(this.info()!.opensOn));
  readonly signedIn = computed(() => this.auth.isAuthenticated());
  /**
   * "My page" from the PreSchool site opens the PreSchool side: its dashboard
   * for SuperAdmin and PreSchool staff, the child's page for a parent. Anyone
   * else keeps their own landing page.
   */
  readonly landing = computed(() => {
    if (this.auth.hasAnyRole(['PreSchoolHead', 'PreSchoolFrontDesk', 'PreSchoolTutor'])) return '/preschool/dashboard';
    if (this.auth.hasAnyRole(['Parent'])) return '/preschool/parent';
    return this.auth.user()?.landingRoute ?? '/';
  });

  form: PreSchoolEnquirySave = emptyEnquiry();

  ngOnInit(): void {
    this.preschool.publicPage().subscribe({ next: p => this.info.set(p) });
  }

  theme(i: number) { return CLASS_THEMES[i % CLASS_THEMES.length]; }

  ageRange(min?: number | null, max?: number | null): string {
    if (min == null && max == null) return '';
    if (min == null) return `up to ${ageLabel(max)}`;
    if (max == null) return `${ageLabel(min)} and above`;
    return `${ageLabel(min)} – ${ageLabel(max)}`;
  }

  go(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  send(): void {
    const f = this.form;
    if (!f.childName.trim()) return this.error.set('Please enter your child\'s name.');
    if (!f.parentName.trim()) return this.error.set('Please enter your name.');
    if (!/^\+?[0-9 \-]{10,15}$/.test(f.phone.trim())) return this.error.set('Please enter a 10-digit phone number.');
    this.error.set(null);
    this.sending.set(true);
    this.preschool.sendEnquiry({
      ...f,
      childDateOfBirth: f.childDateOfBirth || null,
      email: f.email?.trim() || null,
      message: f.message?.trim() || null
    }).subscribe({
      next: msg => {
        this.sending.set(false);
        this.sent.set(msg || 'The school will call you soon.');
        this.form = emptyEnquiry();
      },
      // The error interceptor has already shown why; the form stays filled in to try again.
      error: () => this.sending.set(false)
    });
  }
}
