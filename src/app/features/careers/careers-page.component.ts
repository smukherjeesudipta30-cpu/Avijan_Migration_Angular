import { DatePipe, DOCUMENT } from '@angular/common';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

import {
  AVIJAN_FACEBOOK, AVIJAN_INSTAGRAM, CAREERS_URL, CareerUpload, JobApply, SALARY_NORMS, Vacancy, hiringHeadline, shiftLabel
} from '../../core/models/career.model';
import { resizeImageToLimit } from '../../core/images/image-resize';
import { CareerService } from '../../core/services/career.service';

const MAX_CV_BYTES = 3 * 1024 * 1024;
const CV_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png'
];

/**
 * The public careers page — the vacancies (Teacher, Receptionist, …) Admin has opened, per branch,
 * with an Apply pop-up that takes a CV and a photograph. Outside the sign-in, and
 * the page that is shared on Avijan's Facebook and Instagram. A link with
 * <c>?v=&lt;id&gt;</c> opens that vacancy's form straight away.
 */
@Component({
  selector: 'app-careers-page',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule, DialogModule, InputTextModule, TextareaModule],
  template: `
    <div class="cr">
      <header class="cr__hero">
        <a routerLink="/" class="cr__logo"><img src="images/logo.png" alt="Avijan" /></a>
        <span class="cr__eyebrow">Careers at Avijan</span>
        <h1>Join our team</h1>
        <p>We are hiring{{ vacancies().length ? ' ' + headline() : '' }} for our branches. Choose a vacancy below and apply in two minutes —
          keep your CV and a photograph ready.</p>
        <div class="cr__social">
          <a [href]="instagram" target="_blank" rel="noopener"><i class="pi pi-instagram"></i> Instagram</a>
          <a [href]="facebook" target="_blank" rel="noopener"><i class="pi pi-facebook"></i> Facebook</a>
        </div>
      </header>

      <main class="cr__body">
        @if (loading()) {
          <p class="cr__state"><i class="pi pi-spin pi-spinner"></i> Loading vacancies…</p>
        } @else if (loadError()) {
          <div class="cr__state cr__state--error">
            <p>{{ loadError() }}</p>
            <p-button label="Retry" icon="pi pi-refresh" (onClick)="load()" />
          </div>
        } @else if (!vacancies().length) {
          <div class="cr__state">
            <i class="pi pi-briefcase"></i>
            <p><strong>No vacancies are open right now.</strong></p>
            <p>Follow Avijan on Instagram and Facebook — new openings are posted there first.</p>
          </div>
        } @else {
          <div class="cr__list">
            @for (v of vacancies(); track v.id) {
              <article class="cr__card">
                <div class="cr__card-head">
                  <div>
                    <h2>{{ v.title }}</h2>
                    <p class="cr__branch"><i class="pi pi-map-marker"></i> {{ v.branch }} branch</p>
                  </div>
                  <span class="cr__openings">{{ v.openings }} {{ v.openings === 1 ? 'post' : 'posts' }}</span>
                </div>

                <ul class="cr__facts">
                  @if (shift(v)) { <li><i class="pi pi-clock"></i><span>{{ shift(v) }}</span></li> }
                  @if (v.workingDays) { <li><i class="pi pi-calendar"></i><span>{{ v.workingDays }}</span></li> }
                  <li><i class="pi pi-book"></i><span><strong>Qualification:</strong> {{ v.qualification }}</span></li>
                  @if (v.experience) { <li><i class="pi pi-star"></i><span><strong>Experience:</strong> {{ v.experience }}</span></li> }
                  <li><i class="pi pi-wallet"></i><span><strong>Salary:</strong> {{ v.salary || salaryNorms }}</span></li>
                </ul>
                @if (v.description) { <p class="cr__desc">{{ v.description }}</p> }

                <div class="cr__card-foot">
                  @if (v.closesOn) { <small>Apply by {{ v.closesOn | date: 'd MMM y' }}</small> } @else { <small>Open until filled</small> }
                  <p-button label="Apply now" icon="pi pi-send" (onClick)="openApply(v)" />
                </div>
              </article>
            }
          </div>
        }

        <section class="cr__share">
          <h3>Know someone who would fit?</h3>
          <p>Share this page — on WhatsApp, Facebook, or in an Instagram story.</p>
          <div class="cr__share-buttons">
            <a class="cr__share-btn wa" [href]="whatsAppLink" target="_blank" rel="noopener"><i class="pi pi-whatsapp"></i> WhatsApp</a>
            <a class="cr__share-btn fb" [href]="facebookShareLink" target="_blank" rel="noopener"><i class="pi pi-facebook"></i> Facebook</a>
            <button type="button" class="cr__share-btn" (click)="copyLink()"><i class="pi" [class.pi-link]="!copied()" [class.pi-check]="copied()"></i>
              {{ copied() ? 'Link copied' : 'Copy link (Instagram)' }}</button>
            @if (canShare) {
              <button type="button" class="cr__share-btn" (click)="nativeShare()"><i class="pi pi-share-alt"></i> More…</button>
            }
          </div>
        </section>
      </main>
    </div>

    <p-dialog [visible]="!!applying()" (visibleChange)="$event || closeApply()" [modal]="true" [draggable]="false"
              [style]="{ width: 'min(34rem, 96vw)' }" [header]="applying() ? 'Apply — ' + applying()!.title + ', ' + applying()!.branch : ''"
              appendTo="body" [dismissableMask]="!sending()">
      @if (done()) {
        <div class="cr__done">
          <i class="pi pi-check-circle"></i>
          <h3>Application received</h3>
          <p>Thank you, {{ form.name }}. The office will contact you on {{ form.phone }}.</p>
          <p-button label="Close" (onClick)="closeApply()" />
        </div>
      } @else if (applying()) {
        <p class="cr__dialog-sub">{{ shift(applying()!) }}</p>
        <div class="cr__form">
          <label><span>Full name <em>*</em></span><input pInputText [(ngModel)]="form.name" maxlength="100" autocomplete="name" /></label>
          <label><span>Phone (10 digits) <em>*</em></span><input pInputText [(ngModel)]="form.phone" maxlength="10" inputmode="numeric" autocomplete="tel" /></label>
          <label>Email<input pInputText type="email" [(ngModel)]="form.email" maxlength="150" autocomplete="email" /></label>
          <label><span>Highest qualification <em>*</em></span><input pInputText [(ngModel)]="form.qualification" maxlength="300" placeholder="e.g. B.Com, 2024" /></label>
          <label class="cr__wide">Experience<input pInputText [(ngModel)]="form.experience" maxlength="300" placeholder="e.g. 1 year front desk, or Fresher" /></label>
          <label class="cr__wide">Address<input pInputText [(ngModel)]="form.address" maxlength="300" /></label>

          <div class="cr__upload">
            <span>Photograph <em>*</em></span>
            @if (photo(); as p) {
              <div class="cr__preview">
                <img [src]="'data:' + p.contentType + ';base64,' + p.base64" alt="Your photograph" />
                <button type="button" class="cr__link" (click)="photo.set(null)">Remove</button>
              </div>
            } @else if (busy() === 'photo') {
              <small><i class="pi pi-spin pi-spinner"></i> Preparing photo…</small>
            } @else {
              <div class="cr__upload-btns">
                <label class="cr__pick"><i class="pi pi-camera"></i> Take photo
                  <input type="file" accept="image/*" capture="user" (change)="pickPhoto($event)" /></label>
                <label class="cr__pick"><i class="pi pi-images"></i> Choose photo
                  <input type="file" accept="image/*" (change)="pickPhoto($event)" /></label>
              </div>
            }
          </div>

          <div class="cr__upload">
            <span>CV <em>*</em> <small>(PDF, Word or a picture, up to 3 MB)</small></span>
            @if (cv(); as c) {
              <div class="cr__preview">
                <i class="pi pi-file"></i><small>{{ c.fileName }}</small>
                <button type="button" class="cr__link" (click)="cv.set(null)">Remove</button>
              </div>
            } @else if (busy() === 'cv') {
              <small><i class="pi pi-spin pi-spinner"></i> Preparing CV…</small>
            } @else {
              <div class="cr__upload-btns">
                <label class="cr__pick"><i class="pi pi-upload"></i> Attach CV
                  <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*" (change)="pickCv($event)" /></label>
              </div>
            }
          </div>

          <label class="cr__wide">Anything else you would like to tell us<textarea pTextarea rows="2" [(ngModel)]="form.message" maxlength="1000"></textarea></label>
        </div>

        @if (error()) { <p class="cr__error">{{ error() }}</p> }
        @if (sending() && progress() !== null) {
          <div class="cr__progress"><span [style.width.%]="progress()"></span></div>
        }
        <div class="cr__actions">
          <p-button label="Cancel" [text]="true" severity="secondary" [disabled]="sending()" (onClick)="closeApply()" />
          <p-button [label]="sending() ? 'Sending… ' + (progress() ?? 0) + '%' : 'Submit application'" icon="pi pi-send"
                    [loading]="sending()" (onClick)="submit()" />
        </div>
      }
    </p-dialog>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #f4f6fb; color: #1f2a44; }
    .cr__hero {
      background: linear-gradient(135deg, #0a283c 0%, #12466a 60%, #1d6fa5 100%);
      color: #fff; padding: 2rem 1rem 3.5rem; text-align: center;
    }
    .cr__logo img { height: 46px; background: #fff; border-radius: 10px; padding: 0.35rem 0.6rem; }
    .cr__eyebrow { display: block; margin-top: 1.2rem; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #ffd58a; }
    .cr__hero h1 { margin: 0.3rem 0 0.6rem; font-size: clamp(1.7rem, 5vw, 2.4rem); color: #fff; }
    .cr__hero p { max-width: 36rem; margin: 0 auto; opacity: 0.92; line-height: 1.5; }
    .cr__social { display: flex; gap: 0.6rem; justify-content: center; margin-top: 1.1rem; flex-wrap: wrap; }
    .cr__social a {
      display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem; border-radius: 999px;
      background: rgba(255,255,255,0.14); color: #fff; text-decoration: none; font-weight: 600; font-size: 0.88rem;
    }
    .cr__social a:hover { background: rgba(255,255,255,0.24); }
    .cr__body { max-width: 60rem; margin: -2rem auto 0; padding: 0 1rem 2.5rem; }
    .cr__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 1rem; }
    .cr__card {
      background: #fff; border-radius: 14px; padding: 1.1rem 1.2rem; border: 1px solid #e6e8ef;
      box-shadow: 0 10px 28px -18px rgba(10,40,60,0.45); display: flex; flex-direction: column;
    }
    .cr__card-head { display: flex; justify-content: space-between; gap: 0.8rem; align-items: flex-start; }
    .cr__card h2 { margin: 0; font-size: 1.2rem; }
    .cr__branch { margin: 0.2rem 0 0; color: #12466a; font-weight: 600; }
    .cr__openings { background: #eef4fa; color: #12466a; font-weight: 700; font-size: 0.78rem; padding: 0.2rem 0.6rem; border-radius: 999px; white-space: nowrap; }
    .cr__facts { list-style: none; padding: 0; margin: 0.9rem 0 0; display: grid; gap: 0.45rem; font-size: 0.92rem; }
    .cr__facts li { display: flex; gap: 0.55rem; align-items: flex-start; }
    .cr__facts .pi { color: #12466a; margin-top: 0.2rem; }
    .cr__desc { color: #4a5470; font-size: 0.9rem; line-height: 1.5; margin: 0.8rem 0 0; }
    .cr__card-foot { margin-top: auto; padding-top: 1rem; display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
    .cr__card-foot small { color: #66708a; }
    .cr__state { background: #fff; border-radius: 14px; padding: 2rem 1rem; text-align: center; border: 1px solid #e6e8ef; }
    .cr__state .pi-briefcase { font-size: 2rem; color: #12466a; }
    .cr__state--error { color: #b42318; }
    .cr__share { margin-top: 1.5rem; background: #fff; border-radius: 14px; padding: 1.2rem; border: 1px solid #e6e8ef; text-align: center; }
    .cr__share h3 { margin: 0 0 0.3rem; }
    .cr__share p { margin: 0 0 0.9rem; color: #66708a; }
    .cr__share-buttons { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
    .cr__share-btn {
      display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem; border-radius: 999px;
      border: 1px solid #d5dae6; background: #fff; color: #1f2a44; font: inherit; font-weight: 600; font-size: 0.88rem;
      text-decoration: none; cursor: pointer;
    }
    .cr__share-btn.wa { background: #25d366; border-color: #25d366; color: #fff; }
    .cr__share-btn.fb { background: #1877f2; border-color: #1877f2; color: #fff; }
    .cr__dialog-sub { margin: -0.4rem 0 0.8rem; color: #66708a; }
    .cr__form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
    .cr__form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 600; }
    .cr__form em { color: #b42318; font-style: normal; }
    .cr__wide, .cr__upload { grid-column: 1 / -1; }
    .cr__upload { border: 1px dashed #c9cfdc; border-radius: 10px; padding: 0.6rem 0.75rem; font-size: 0.85rem; font-weight: 600; }
    .cr__upload small { font-weight: 400; color: #66708a; }
    .cr__upload input[type=file] { display: none; }
    .cr__upload-btns { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.4rem; }
    .cr__pick {
      display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 0.35rem !important;
      padding: 0.4rem 0.75rem; border-radius: 999px; border: 1px solid #d5dae6; background: #fff; cursor: pointer;
    }
    .cr__preview { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.4rem; }
    .cr__preview img { width: 3.6rem; height: 3.6rem; object-fit: cover; border-radius: 8px; border: 1px solid #e3e6ee; }
    .cr__link { border: 0; background: none; color: #b42318; font: inherit; font-weight: 600; cursor: pointer; padding: 0; }
    .cr__error { color: #b42318; font-weight: 600; margin: 0.8rem 0 0; }
    .cr__progress { height: 6px; border-radius: 999px; background: #e6e8ef; overflow: hidden; margin-top: 0.8rem; }
    .cr__progress span { display: block; height: 100%; background: #1f7a54; transition: width 0.2s ease; }
    .cr__actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .cr__done { text-align: center; padding: 1rem 0; }
    .cr__done .pi { font-size: 2.6rem; color: #1f7a54; }
    @media (max-width: 560px) { .cr__form { grid-template-columns: 1fr; } }
  `]
})
export class CareersPageComponent implements OnInit, OnDestroy {
  private readonly careers = inject(CareerService);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private jobPostingScript: HTMLScriptElement | null = null;

  readonly instagram = AVIJAN_INSTAGRAM;
  readonly facebook = AVIJAN_FACEBOOK;
  readonly facebookShareLink = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(CAREERS_URL)}`;
  readonly whatsAppLink = `https://wa.me/?text=${encodeURIComponent('Avijan is hiring — see the vacancies and apply here: ' + CAREERS_URL)}`;
  readonly canShare = typeof navigator !== 'undefined' && !!navigator.share;

  readonly vacancies = signal<Vacancy[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly copied = signal(false);

  readonly applying = signal<Vacancy | null>(null);
  readonly photo = signal<CareerUpload | null>(null);
  readonly cv = signal<CareerUpload | null>(null);
  readonly busy = signal<'photo' | 'cv' | null>(null);
  readonly sending = signal(false);
  readonly progress = signal<number | null>(null);
  readonly error = signal<string | null>(null);
  readonly done = signal(false);
  form = this.blank();

  readonly shift = (v: Vacancy) => shiftLabel(v);
  readonly salaryNorms = SALARY_NORMS;
  readonly headline = () => hiringHeadline(this.vacancies());

  ngOnInit(): void {
    // Search results: this page's own title and summary.
    this.title.setTitle('Careers at Avijan — Teacher & Receptionist jobs, Kolkata');
    this.meta.updateTag({
      name: 'description',
      content: 'Jobs at Avijan, Kolkata: Teacher and Receptionist vacancies at our branches. See shift timings and qualifications, and apply online with your CV.'
    });
    this.meta.updateTag({ property: 'og:url', content: CAREERS_URL });
    this.load();
  }

  ngOnDestroy(): void {
    this.jobPostingScript?.remove();
  }

  /**
   * Google for Jobs: each open vacancy as a schema.org JobPosting, so a search
   * for teacher or receptionist jobs nearby can show it with its branch and shift.
   */
  private publishJobPostings(list: Vacancy[]): void {
    this.jobPostingScript?.remove();
    this.jobPostingScript = null;
    if (!list.length) return;

    const today = new Date().toISOString().slice(0, 10);
    const postings = list.map(v => ({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: `${v.title} — ${v.branch}`,
      description: [
        `<p>${v.title} at Avijan, ${v.branch} branch.</p>`,
        shiftLabel(v) ? `<p>Shift: ${shiftLabel(v)}</p>` : '',
        v.workingDays ? `<p>Working days: ${v.workingDays}</p>` : '',
        `<p>Qualification: ${v.qualification}</p>`,
        v.experience ? `<p>Experience: ${v.experience}</p>` : '',
        v.description ? `<p>${v.description}</p>` : ''
      ].join(''),
      datePosted: today,
      ...(v.closesOn ? { validThrough: `${v.closesOn}T23:59:59+05:30` } : {}),
      employmentType: 'FULL_TIME',
      totalJobOpenings: v.openings,
      hiringOrganization: {
        '@type': 'Organization', name: 'Avijan', sameAs: 'https://www.avijan.in',
        logo: 'https://www.avijan.in/images/logo.png'
      },
      jobLocation: {
        '@type': 'Place',
        address: {
          '@type': 'PostalAddress', streetAddress: `${v.branch} branch`, addressLocality: 'Kolkata',
          addressRegion: 'West Bengal', addressCountry: 'IN'
        }
      },
      directApply: true,
      url: `${CAREERS_URL}?v=${v.id}`
    }));

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(postings);
    this.document.head.appendChild(script);
    this.jobPostingScript = script;
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.careers.open().subscribe({
      next: list => {
        this.vacancies.set(list);
        this.loading.set(false);
        this.publishJobPostings(list);
        // A shared link straight to one vacancy opens its form.
        const id = Number(this.route.snapshot.queryParamMap.get('v'));
        const wanted = id ? list.find(v => v.id === id) : undefined;
        if (wanted) this.openApply(wanted);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('The vacancies could not be loaded. Check your connection and try again.');
      }
    });
  }

  private blank() {
    return { name: '', phone: '', email: '', qualification: '', experience: '', address: '', message: '' };
  }

  openApply(v: Vacancy): void {
    this.applying.set(v);
    this.done.set(false);
    this.error.set(null);
  }

  closeApply(): void {
    if (this.sending()) return;
    this.applying.set(null);
    if (this.done()) {
      this.form = this.blank();
      this.photo.set(null);
      this.cv.set(null);
      this.done.set(false);
    }
  }

  async pickPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.busy.set('photo');
    this.error.set(null);
    try {
      // A phone camera photo is several MB; the office only needs a clear face.
      const small = await resizeImageToLimit(file, 900 * 1024, 900);
      this.photo.set(await toUpload(small));
    } catch {
      this.error.set('That picture could not be read. Please take or choose another photo.');
    } finally {
      this.busy.set(null);
    }
  }

  async pickCv(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    let file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.busy.set('cv');
    this.error.set(null);
    try {
      if (file.type.startsWith('image/')) file = await resizeImageToLimit(file, 1.5 * 1024 * 1024, 1800);
      const type = file.type || guessType(file.name);
      if (!CV_TYPES.includes(type)) {
        this.error.set('Your CV must be a PDF, a Word document or a picture.');
        return;
      }
      if (file.size > MAX_CV_BYTES) {
        this.error.set(`Your CV is ${(file.size / 1024 / 1024).toFixed(1)} MB. Please attach one under 3 MB.`);
        return;
      }
      this.cv.set({ ...(await toUpload(file)), contentType: type });
    } catch {
      this.error.set('That file could not be read. Please attach it again.');
    } finally {
      this.busy.set(null);
    }
  }

  submit(): void {
    const v = this.applying();
    if (!v) return;
    const f = this.form;
    const problem =
      !f.name.trim() ? 'Enter your name.'
        : !/^[0-9]{10}$/.test(f.phone.trim()) ? 'Enter a 10-digit phone number.'
        : !f.qualification.trim() ? 'Enter your highest qualification.'
        : !this.photo() ? 'Add your photograph.'
        : !this.cv() ? 'Attach your CV.'
        : null;
    if (problem) { this.error.set(problem); return; }

    const request: JobApply = {
      name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() || null,
      qualification: f.qualification.trim(), experience: f.experience.trim() || null,
      address: f.address.trim() || null, message: f.message.trim() || null,
      cv: this.cv(), photo: this.photo()
    };

    this.sending.set(true);
    this.progress.set(0);
    this.error.set(null);
    this.careers.apply(v.id, request).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress.set(Math.round(100 * event.loaded / event.total));
        } else if (event.type === HttpEventType.Response) {
          this.sending.set(false);
          this.progress.set(null);
          this.done.set(true);
        }
      },
      error: (err: unknown) => {
        this.sending.set(false);
        this.progress.set(null);
        const status = err instanceof HttpErrorResponse ? err.status : 0;
        const message = err instanceof HttpErrorResponse
          ? (err.error?.message || (err.error?.errors ?? []).join(' '))
          : '';
        this.error.set(status === 429
          ? 'Too many attempts from this device. Please wait a few minutes and try again.'
          : message || 'The application could not be sent. Check your connection and try again.');
      }
    });
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(CAREERS_URL);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch { /* clipboard blocked: the link is also in the WhatsApp / Facebook buttons */ }
  }

  async nativeShare(): Promise<void> {
    try {
      await navigator.share({ title: 'Avijan is hiring', text: 'Vacancies at Avijan — apply online:', url: CAREERS_URL });
    } catch { /* cancelled */ }
  }
}

function toUpload(file: File): Promise<CareerUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      fileName: file.name,
      contentType: file.type || guessType(file.name),
      base64: String(reader.result).split(',')[1] ?? ''
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function guessType(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'pdf' ? 'application/pdf'
    : ext === 'doc' ? 'application/msword'
    : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : ext === 'png' ? 'image/png'
    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : '';
}
