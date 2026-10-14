import { DatePipe } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { downloadBlob } from '../../core/printing/download-file';
import { BirthdayKind, BirthdayPerson, BirthdayService } from '../../core/services/birthday.service';
import { StudentService } from '../../core/services/student.service';
import { drawBirthdayCard, loadImage, whatsAppUrl, wishText } from './birthday-card';

type Window = 0 | 7 | 30;
const KINDS: BirthdayKind[] = ['Student', 'Teacher', 'Receptionist', 'Technical Staff', 'Editor', 'Admin', 'SuperAdmin'];

/**
 * Today's and upcoming birthdays of students and staff (wherever a date of birth
 * is recorded), with a wish card Admin can send on WhatsApp.
 */
@Component({
  selector: 'app-birthdays',
  standalone: true,
  imports: [DatePipe, ButtonModule, DialogModule],
  template: `
    <section class="bd">
      <header class="bd__head">
        <div>
          <h1><i class="pi pi-gift"></i> Birthdays</h1>
          <p class="app-muted">Students (from the student record) and staff — Teacher, Receptionist, Technical Staff, Editor, Admin — from Users.</p>
        </div>
        <div class="bd__tabs">
          @for (w of windows; track w.value) {
            <button type="button" [class.on]="range() === w.value" (click)="range.set(w.value)">{{ w.label }}</button>
          }
        </div>
      </header>

      <div class="bd__chips">
        <button type="button" [class.on]="kind() === null" (click)="kind.set(null)">All ({{ inRange().length }})</button>
        @for (k of kinds; track k) {
          @if (count(k)) {
            <button type="button" [class.on]="kind() === k" (click)="kind.set(k)">{{ k }} ({{ count(k) }})</button>
          }
        }
      </div>

      @if (loading()) {
        <p class="app-muted">Loading…</p>
      } @else if (!shown().length) {
        <div class="bd__empty"><i class="pi pi-calendar"></i>
          <p>No birthdays {{ range() === 0 ? 'today' : 'in the next ' + range() + ' days' }}.</p></div>
      } @else {
        <div class="bd__grid">
          @for (p of shown(); track p.key) {
            <article class="bd__card" [class.bd__card--today]="p.daysAway === 0">
              <div class="bd__when">
                @if (p.daysAway === 0) { <span class="bd__today">🎂 Today</span> }
                @else if (p.daysAway === 1) { Tomorrow }
                @else { {{ p.nextBirthday | date: 'EEE, d MMM' }} · in {{ p.daysAway }} days }
              </div>
              <h3>{{ p.name || '—' }}</h3>
              <p class="bd__meta"><span class="bd__kind" [attr.data-kind]="p.kind">{{ p.kind }}</span>
                turning {{ p.turningAge }}</p>
              <p class="bd__meta app-muted">{{ p.phone || 'No phone number' }}@if (p.registrationId) { · {{ p.registrationId }} }</p>
              <div class="bd__actions">
                <p-button label="Wish card" icon="pi pi-image" size="small" (onClick)="open(p)" />
                <a class="bd__wa" [href]="waLink(p)" target="_blank" rel="noopener"><i class="pi pi-whatsapp"></i> WhatsApp</a>
              </div>
            </article>
          }
        </div>
      }
    </section>

    <p-dialog [visible]="!!selected()" (visibleChange)="!$event && selected.set(null)" [modal]="true"
              [header]="'Birthday card — ' + (selected()?.name || '')" [style]="{ width: 'min(30rem, 96vw)' }">
      <canvas #card class="bd__canvas"></canvas>
      <p class="app-muted bd__hint">Share the card, then pick WhatsApp. Or send the message straight to their number.</p>
      <div class="bd__dialog-actions">
        <p-button label="Share card" icon="pi pi-share-alt" (onClick)="share()" [loading]="busy()" />
        <p-button label="Download" icon="pi pi-download" severity="secondary" (onClick)="download()" />
        @if (selected(); as p) {
          <a class="bd__wa" [href]="waLink(p)" target="_blank" rel="noopener"><i class="pi pi-whatsapp"></i> Send wish</a>
        }
      </div>
    </p-dialog>
  `,
  styles: [`
    .bd { padding: 1rem; max-width: 72rem; }
    .bd__head { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: flex-end; }
    h1 { margin: 0; font-size: 1.5rem; display: flex; gap: .5rem; align-items: center; color: #8e2de2; }
    .bd__tabs, .bd__chips { display: flex; flex-wrap: wrap; gap: .4rem; }
    .bd__chips { margin: 1rem 0; }
    .bd__tabs button, .bd__chips button { border: 1px solid #d9cdf0; background: #fff; color: #5a189a; border-radius: 999px;
      padding: .35rem .9rem; cursor: pointer; font: inherit; font-size: .88rem; }
    .bd__tabs button.on, .bd__chips button.on { background: linear-gradient(135deg, #ff5f8f, #8e2de2); color: #fff; border-color: transparent; }
    .bd__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: .9rem; }
    .bd__card { background: #fff; border: 1px solid #ece6f7; border-radius: 14px; padding: 1rem; display: flex; flex-direction: column; gap: .3rem; }
    .bd__card--today { border: 0; background: linear-gradient(135deg, #fff0f6, #f3e8ff); box-shadow: 0 10px 26px -16px #8e2de2; }
    .bd__when { font-size: .82rem; color: #66708a; }
    .bd__today { color: #d6336c; font-weight: 700; }
    h3 { margin: .1rem 0; font-size: 1.1rem; color: #1f2a44; }
    .bd__meta { margin: 0; font-size: .86rem; }
    .bd__kind { display: inline-block; padding: .05rem .5rem; border-radius: 6px; background: #eef2ff; color: #3949ab; font-weight: 600; font-size: .78rem; margin-right: .3rem; }
    .bd__kind[data-kind="Student"] { background: #e7f6ec; color: #1f7a3f; }
    .bd__kind[data-kind="Technical Staff"] { background: #fff4e0; color: #b25e00; }
    .bd__kind[data-kind="Editor"] { background: #fdeaf3; color: #b4236b; }
    .bd__actions, .bd__dialog-actions { display: flex; gap: .5rem; align-items: center; margin-top: .5rem; flex-wrap: wrap; }
    .bd__wa { display: inline-flex; align-items: center; gap: .35rem; background: #25d366; color: #fff; text-decoration: none;
      border-radius: 8px; padding: .4rem .8rem; font-weight: 600; font-size: .88rem; }
    .bd__empty { text-align: center; padding: 3rem 1rem; color: #66708a; }
    .bd__empty .pi { font-size: 2rem; }
    .bd__canvas { width: 100%; height: auto; border-radius: 12px; display: block; }
    .bd__hint { font-size: .82rem; margin: .6rem 0 0; }
  `]
})
export class BirthdaysComponent implements OnInit {
  private readonly birthdays = inject(BirthdayService);
  private readonly students = inject(StudentService);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('card');

  readonly windows: { value: Window; label: string }[] = [
    { value: 0, label: 'Today' }, { value: 7, label: 'Next 7 days' }, { value: 30, label: 'Next 30 days' }];
  readonly kinds = KINDS;

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly all = signal<BirthdayPerson[]>([]);
  readonly range = signal<Window>(7);
  readonly kind = signal<BirthdayKind | null>(null);
  readonly selected = signal<BirthdayPerson | null>(null);

  readonly inRange = computed(() => this.all().filter(p => p.daysAway <= this.range()));
  readonly shown = computed(() => this.inRange().filter(p => !this.kind() || p.kind === this.kind()));

  ngOnInit(): void {
    this.birthdays.upcoming(30).subscribe({
      next: list => {
        this.all.set(list);
        // Open on Today when there is someone to wish, otherwise the week ahead.
        this.range.set(list.some(p => p.daysAway === 0) ? 0 : 7);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  count(k: BirthdayKind): number {
    return this.inRange().filter(p => p.kind === k).length;
  }

  waLink(p: BirthdayPerson): string {
    return whatsAppUrl(p.phone, wishText(p.name ?? ''));
  }

  async open(p: BirthdayPerson): Promise<void> {
    this.selected.set(p);
    const [photo, logo] = await Promise.all([this.photoFor(p), loadImage('images/logo.png')]);
    // The dialog's canvas exists only once it has rendered.
    await new Promise(r => setTimeout(r));
    const el = this.canvas()?.nativeElement;
    if (!el || this.selected() !== p) return;
    drawBirthdayCard(el, {
      name: p.name || 'Friend', kind: p.kind, turningAge: p.turningAge,
      date: new Date(p.nextBirthday), photo, logo, seed: p.key
    });
  }

  async share(): Promise<void> {
    const blob = await this.cardBlob();
    if (!blob) return;
    const file = new File([blob], this.fileName(), { type: 'image/png' });
    const p = this.selected();
    this.busy.set(true);
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: wishText(p?.name ?? '') });
      } else {
        await downloadBlob(blob, file.name);
      }
    } catch {
      // Cancelled by the user.
    } finally {
      this.busy.set(false);
    }
  }

  async download(): Promise<void> {
    const blob = await this.cardBlob();
    if (blob) await downloadBlob(blob, this.fileName());
  }

  private cardBlob(): Promise<Blob | null> {
    const el = this.canvas()?.nativeElement;
    return new Promise(resolve => el ? el.toBlob(b => resolve(b), 'image/png') : resolve(null));
  }

  private fileName(): string {
    return `Happy-Birthday-${(this.selected()?.name || 'card').trim().replace(/[^A-Za-z0-9]+/g, '-')}.png`;
  }

  private async photoFor(p: BirthdayPerson): Promise<HTMLImageElement | null> {
    if (!p.registrationId) return null;
    try {
      const blob = await firstValueFrom(this.students.photoBlob(p.registrationId));
      if (!blob?.size) return null;
      const url = URL.createObjectURL(blob);
      const img = await loadImage(url);
      return img;
    } catch {
      return null;
    }
  }
}
