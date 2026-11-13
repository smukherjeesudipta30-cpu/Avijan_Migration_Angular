import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { RouterLink } from '@angular/router';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolOverview, ageLabel } from '../../../core/models/preschool.model';
import { PreSchoolAlerts } from '../../../core/models/preschool-finance.model';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolFinanceService } from '../../../core/services/preschool-finance.service';
import { PreSchoolService } from '../../../core/services/preschool.service';

/** One soft colour per class card, in class order; repeats after four. */
const CARD_TONES = ['#ffe3ec', '#e3f2ff', '#e6f8e6', '#fff1d6'];
const CARD_INKS = ['#b3264f', '#1d5fa8', '#2b7a2b', '#9a5b00'];

/**
 * The PreSchool's landing page for its admin, receptionist and teachers. Shows
 * the classes with their fees and subjects; students, receipts and results
 * join it as those phases are built.
 */
@Component({
  selector: 'app-preschool-dashboard',
  standalone: true,
  imports: [DatePipe, RouterLink, FormsModule, InputTextModule],
  template: `
    <section class="psd__hero">
      <div>
        <span class="psd__eyebrow">Avijan PreSchool · powered by <img class="psd__mcs" src="images/my-chhota-school.svg" alt="My Chhota School" /></span>
        <h1>{{ overview()?.settings?.schoolName ?? 'Avijan PreSchool' }}</h1>
        <p>
          <i class="pi pi-map-marker" aria-hidden="true"></i>
          {{ overview()?.settings?.address || 'Champahati' }}
          @if (overview()?.settings?.phone; as phone) { · <i class="pi pi-phone" aria-hidden="true"></i> {{ phone }} }
        </p>
      </div>
      <div class="psd__hero-art" aria-hidden="true">
        <span>🎨</span><span>🧸</span><span>📚</span>
      </div>
    </section>

    @if (failed()) {
      <p class="app-card psd__error">The PreSchool details could not be loaded. Please refresh the page.</p>
    }

    @if (isHead() && alerts(); as a) {
      <section class="app-card psd__alerts">
        <div class="psd__alerts-head">
          <h2><i class="pi pi-bell" aria-hidden="true"></i> Alerts
            @if (a.unread) { <span class="psd__unread">{{ a.unread }} new</span> }</h2>
          @if (a.unread) { <button type="button" class="psd__link" (click)="readAll()">Mark all read</button> }
        </div>
        @for (n of a.items.slice(0, 6); track n.id) {
          <div class="psd__alert" [class.psd__alert--new]="!n.isRead">
            <i class="pi pi-key" aria-hidden="true"></i>
            <span><strong>{{ n.title }}</strong><small>{{ n.createdOn | date: 'd MMM y, h:mm a' }}@if (n.loginId) { · {{ n.loginId }} }</small></span>
            @if (!n.isRead) { <button type="button" class="psd__link" (click)="read(n.id)">Mark read</button> }
          </div>
        } @empty {
          <p class="app-muted psd__none">No alerts. You are told here when a PreSchool staff member changes their password.</p>
        }
      </section>
    }

    @if (isOffice() && overview(); as o) {
      <section class="app-card psd__mail">
        <i class="pi pi-envelope" aria-hidden="true"></i>
        <div>
          <strong>PreSchool email</strong>
          <small class="app-muted">Shown to parents; replies to the PreSchool's emails come here.</small>
        </div>
        @if (editingEmail()) {
          <input pInputText type="email" [(ngModel)]="emailDraft" maxlength="150" aria-label="PreSchool email" />
          <button type="button" class="psd__link" (click)="saveEmail()">Save</button>
          <button type="button" class="psd__link" (click)="editingEmail.set(false)">Cancel</button>
        } @else {
          <span class="psd__mail-value">{{ o.settings.email || 'Not set' }}</span>
          <button type="button" class="psd__link" (click)="emailDraft = o.settings.email ?? ''; editingEmail.set(true)">Change</button>
        }
      </section>
    }

    <h2 class="psd__title">Classes</h2>
    <div class="psd__classes">
      @for (c of activeClasses(); track c.id; let i = $index) {
        <a class="psd__class" [routerLink]="'/preschool/classes'" [queryParams]="{ class: c.id }"
          [style.background]="tone(i)" [style.color]="ink(i)">
          <strong>{{ c.name }}</strong>
          @if (c.minAgeMonths != null || c.maxAgeMonths != null) {
            <small>Age {{ age(c.minAgeMonths) || 'any' }} – {{ age(c.maxAgeMonths) || 'any' }}</small>
          }
          <dl>
            <div><dt>Admission</dt><dd>{{ money(c.admissionFee) }}</dd></div>
            <div><dt>Monthly</dt><dd>{{ money(c.monthlyTotal) }}</dd></div>
            <div><dt>Subjects</dt><dd>{{ countActive(c.subjects) }}</dd></div>
          </dl>
        </a>
      } @empty {
        @if (overview()) { <p class="app-muted">No classes yet.</p> }
      }
    </div>

    <h2 class="psd__title">Get started</h2>
    <div class="psd__steps">
      <a class="app-card psd__step" routerLink="/preschool/classes">
        <i class="pi pi-book" aria-hidden="true"></i>
        <div>
          <strong>Classes &amp; fees</strong>
          <p class="app-muted">Admission fee, monthly fees and subjects for each class.</p>
        </div>
        @if (unsetClasses() > 0) {
          <span class="psd__badge">{{ unsetClasses() }} without fees</span>
        }
      </a>
      @if (isHead()) {
        <a class="app-card psd__step" routerLink="/preschool/settings">
          <i class="pi pi-cog" aria-hidden="true"></i>
          <div>
            <strong>School settings</strong>
            <p class="app-muted">Address, phone, uniform shop, receipt numbers and the grade table.</p>
          </div>
        </a>
      }
      @if (isOffice()) {
        <a class="app-card psd__step" routerLink="/preschool/students">
          <i class="pi pi-user-plus" aria-hidden="true"></i>
          <div>
            <strong>Admissions and fee receipts</strong>
            <p class="app-muted">New admission with ID cards, monthly fees and receipts.</p>
          </div>
        </a>
      }
      <a class="app-card psd__step" routerLink="/preschool/attendance">
        <i class="pi pi-qrcode" aria-hidden="true"></i>
        <div>
          <strong>Attendance</strong>
          <p class="app-muted">{{ isHead() ? 'Put the attendance code on the office screen.' : 'Mark your arrival and departure.' }}</p>
        </div>
      </a>
    </div>
  `,
  styles: [`
    .psd__hero { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 1.5rem;
      border-radius: 18px; background: linear-gradient(120deg, #ffd6e7 0%, #d9ecff 55%, #e2f7dc 100%); color: #2a2f45; }
    .psd__hero h1 { margin: 0.15rem 0 0.35rem; font-size: 1.7rem; }
    .psd__hero p { margin: 0; display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
    .psd__mcs { height: 1.3rem; vertical-align: middle; }
    .psd__eyebrow { font-size: 0.75rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6d28d9; }
    .psd__hero-art { display: flex; gap: 0.5rem; font-size: 2.2rem; }
    .psd__error { color: #b42318; }
    .psd__alerts { margin-top: 1rem; padding: 1rem 1.15rem; }
    .psd__alerts-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .psd__alerts h2 { margin: 0 0 0.5rem; font-size: 1.05rem; display: flex; gap: 0.45rem; align-items: center; }
    .psd__unread { padding: 0.1rem 0.55rem; border-radius: 999px; background: #ff6b8b; color: #fff; font-size: 0.75rem; }
    .psd__alert { display: grid; grid-template-columns: auto 1fr auto; gap: 0.7rem; align-items: center; padding: 0.55rem 0; border-top: 1px solid var(--app-border); }
    .psd__alert > i { color: #9a5b00; }
    .psd__alert small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .psd__alert:not(.psd__alert--new) { opacity: 0.6; }
    .psd__link { border: 0; background: none; color: #6d28d9; font: inherit; font-weight: 600; cursor: pointer; }
    .psd__none { margin: 0; }
    .psd__title { margin: 1.5rem 0 0.75rem; font-size: 1.1rem; }
    .psd__mail { margin-top: 1rem; padding: 0.85rem 1.15rem; display: flex; gap: 0.8rem; align-items: center; flex-wrap: wrap; }
    .psd__mail > i { font-size: 1.3rem; color: #6d28d9; }
    .psd__mail > div { display: flex; flex-direction: column; flex: 1 1 14rem; }
    .psd__mail-value { font-weight: 700; }
    .psd__mail input { min-width: 15rem; }
    .psd__classes { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.9rem; }
    .psd__class { display: flex; flex-direction: column; gap: 0.25rem; padding: 1.1rem; border-radius: 16px;
      text-decoration: none; transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .psd__class:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08); }
    .psd__class strong { font-size: 1.2rem; }
    .psd__class small { opacity: 0.85; }
    .psd__class dl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; margin: 0.6rem 0 0; }
    .psd__class dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8; }
    .psd__class dd { margin: 0; font-weight: 700; color: #2a2f45; }
    .psd__steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: 0.9rem; }
    .psd__step { display: flex; gap: 0.8rem; align-items: flex-start; text-decoration: none; color: inherit; position: relative; }
    .psd__step > i { font-size: 1.4rem; color: #6d28d9; margin-top: 0.15rem; }
    .psd__step p { margin: 0.2rem 0 0; font-size: 0.85rem; }
    .psd__step--soon { opacity: 0.7; }
    .psd__badge { position: absolute; top: 0.6rem; right: 0.6rem; font-size: 0.7rem; font-weight: 700;
      padding: 0.15rem 0.5rem; border-radius: 999px; background: #fff1d6; color: #9a5b00; }
    @media (max-width: 600px) { .psd__hero-art { display: none; } .psd__hero h1 { font-size: 1.35rem; } }
  `]
})
export class PreSchoolDashboardComponent implements OnInit {
  private readonly preschool = inject(PreSchoolService);
  private readonly auth = inject(AuthService);
  private readonly finance = inject(PreSchoolFinanceService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  /** The PreSchool admin's alerts; null until loaded, and never for the receptionist or teachers. */
  readonly alerts = signal<PreSchoolAlerts | null>(null);

  readonly overview = signal<PreSchoolOverview | null>(null);
  readonly failed = signal(false);
  readonly isHead = computed(() => this.auth.hasAnyRole(['PreSchoolHead']));
  readonly isOffice = computed(() => this.auth.hasAnyRole(['PreSchoolHead', 'PreSchoolFrontDesk']));
  readonly editingEmail = signal(false);
  emailDraft = '';

  saveEmail(): void {
    const email = this.emailDraft.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.messages.add({ severity: 'warn', summary: 'Please check', detail: 'Enter a valid email address.', life: 4000 });
      return;
    }
    this.preschool.saveEmail(email).subscribe(s => {
      const o = this.overview();
      if (o) this.overview.set({ ...o, settings: s });
      this.editingEmail.set(false);
      this.messages.add({ severity: 'success', summary: 'PreSchool email saved', life: 2500 });
    });
  }
  readonly activeClasses = computed(() => (this.overview()?.classes ?? []).filter(c => c.isActive));
  /** Active classes still charging nothing a month — the first thing to set up. */
  readonly unsetClasses = computed(() => this.activeClasses().filter(c => c.monthlyTotal === 0).length);

  readonly money = formatMoney;
  readonly age = ageLabel;

  ngOnInit(): void {
    this.preschool.overview().subscribe({
      next: o => this.overview.set(o),
      error: () => this.failed.set(true)
    });

    if (this.isHead()) {
      this.loadAlerts();
      // Checked again every minute while the dashboard is open, so a password
      // change shows up (with a toast) without reloading the page.
      const timer = setInterval(() => this.loadAlerts(true), 60_000);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    }
  }

  private loadAlerts(announce = false): void {
    const before = this.alerts()?.unread ?? 0;
    this.finance.alerts().subscribe(a => {
      if (announce && a.unread > before) {
        const newest = a.items.find(n => !n.isRead);
        this.messages.add({ severity: 'info', summary: 'New alert', detail: newest?.title, life: 6000 });
      }
      this.alerts.set(a);
    });
  }

  read(id: number): void { this.finance.markAlertRead(id).subscribe(() => this.loadAlerts()); }
  readAll(): void { this.finance.markAllAlertsRead().subscribe(() => this.loadAlerts()); }

  tone(i: number): string { return CARD_TONES[i % CARD_TONES.length]; }
  ink(i: number): string { return CARD_INKS[i % CARD_INKS.length]; }
  countActive(items: { isActive: boolean }[]): number { return items.filter(x => x.isActive).length; }
}
