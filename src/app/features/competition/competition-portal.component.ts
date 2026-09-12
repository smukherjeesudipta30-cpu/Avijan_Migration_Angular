import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toDataURL } from 'qrcode';

import {
  CompetitionGroup,
  CompetitionPublic,
  CompetitionRegisterRequest,
  CompetitionRegistered,
  CompetitionUpload
} from '../../core/models/competition.model';
import { CompetitionService } from '../../core/services/competition.service';

type Stage = 'notice' | 'quickstart' | 'form' | 'done';

/**
 * The public face of the yearly Drawing &amp; Dance competition.
 *
 * <p>Open to anyone — entrants are schoolchildren from anywhere, with no sign-in and
 * no connection to the centre's own students. Three stages on one page: read the
 * advertisement and the rules, fill the form and pay, then keep the registration
 * number.</p>
 *
 * <p>English and Bengali together throughout, because the printed poster is in both
 * and a parent should not have to pick a language to find out the date.</p>
 */
@Component({
  selector: 'app-competition-portal',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './competition-portal.component.html',
  styleUrl: './competition-portal.component.scss'
})
export class CompetitionPortalComponent implements OnInit {
  private readonly competitions = inject(CompetitionService);

  readonly notice = signal<CompetitionPublic | null>(null);
  readonly loading = signal(true);
  readonly stage = signal<Stage>('notice');

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<CompetitionRegistered | null>(null);

  /** Ticked before the form opens. The rules are above it, so they are read first. */
  readonly rulesAccepted = signal(false);

  /* --------------------------------------------------- save and resume */

  /** Whether the quick-start panel shows "start new" or "resume" fields. */
  readonly quickStartMode = signal<'start' | 'resume'>('start');
  readonly quickStartSaving = signal(false);
  readonly quickStartError = signal<string | null>(null);

  /** Set once a draft is started or resumed; carried into the final submission. */
  readonly draftCode = signal<string | null>(null);
  /** Shown once, right after starting a draft — the credential to write down. */
  readonly draftJustStarted = signal(false);

  quickStart = { participantName: '', phone: '', email: '', password: '' };
  resumeLogin = { registrationCode: '', password: '' };

  readonly changingPassword = signal(false);
  readonly passwordChangeSaving = signal(false);
  readonly passwordChangeError = signal<string | null>(null);
  readonly passwordChanged = signal(false);
  changePassword = { currentPassword: '', newPassword: '' };

  /* ------------------------------------------------ forgot/reset password */

  /** Toggled from the "resume" tab, for someone who cannot sign in at all. */
  readonly showForgotPassword = signal(false);
  readonly forgotSaving = signal(false);
  readonly forgotError = signal<string | null>(null);
  /** True once the request is sent — moves straight to the code-entry step. */
  readonly forgotSent = signal(false);
  forgotRegistrationCode = '';

  readonly resetSaving = signal(false);
  readonly resetError = signal<string | null>(null);
  readonly resetDone = signal(false);
  resetCode = '';
  resetNewPassword = '';

  /* ------------------------------------------------------------- the form */

  readonly enterDrawing = signal(false);
  readonly enterDance = signal(false);

  form = {
    participantName: '',
    guardianName: '',
    dateOfBirth: '',
    schoolName: '',
    className: '',
    phone: '',
    email: '',
    address: '',
    drawingGroupId: null as number | null,
    danceGroupId: null as number | null,
    paymentMode: 'Online' as 'Online' | 'Venue',
    transactionRef: ''
  };

  readonly photo = signal<CompetitionUpload | null>(null);
  readonly schoolId = signal<CompetitionUpload | null>(null);
  readonly birthCertificate = signal<CompetitionUpload | null>(null);
  readonly paymentSlip = signal<CompetitionUpload | null>(null);

  /** What they owe, worked out the same way the server will work it out. */
  readonly amount = computed(() => {
    const n = this.notice();
    if (!n) return 0;

    return (this.enterDrawing() ? n.drawingFee : 0) + (this.enterDance() ? n.danceFee : 0);
  });

  /**
   * Paying at the venue is for drawing alone — dance must be paid online. Offered
   * only when it is actually allowed, rather than offered and then refused.
   */
  readonly venueAllowed = computed(() => this.enterDrawing() && !this.enterDance());

  /**
   * The <c>upi://pay</c> link behind the QR, carrying the exact amount.
   *
   * <p>The same arrangement the students' own fee page uses. The institute's printed
   * code is static — it carries the merchant id and nothing else — so a parent would
   * have to type ₹140 themselves and a slip of the finger pays the wrong sum. This
   * fills the amount in.</p>
   */
  readonly upiLink = computed(() => {
    const n = this.notice();
    const amount = this.amount();

    if (!n?.upiId || amount <= 0) return null;

    const params = new URLSearchParams({
      pa: n.upiId,
      pn: n.payeeName ?? 'Avijan',
      am: amount.toFixed(2),
      cu: 'INR',
      tn: `Competition ${n.year}`
    });

    return `upi://pay?${params.toString()}`;
  });

  /** The generated QR, as a data URL. */
  readonly qrDataUrl = signal<string | null>(null);

  constructor() {
    /* Redraw the code whenever the amount changes -- ticking Dance on top of
       Drawing turns Rs 40 into Rs 140, and a QR still carrying the old figure
       would have a parent pay the wrong sum. */
    effect(() => {
      const link = this.upiLink();

      if (!link) {
        this.qrDataUrl.set(null);
        return;
      }

      // High error correction, so it still scans off a phone held at an angle.
      toDataURL(link, { errorCorrectionLevel: 'H', margin: 1, width: 320 })
        .then(url => this.qrDataUrl.set(url))
        .catch(() => this.qrDataUrl.set(null));
    });
  }

  ngOnInit(): void {
    this.competitions.publicNotice().subscribe({
      next: notice => {
        this.notice.set(notice);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  /** Suggests the division from the class typed in, so a mistake is visible early. */
  protected suggestDrawing(): void {
    const n = this.notice();
    const cls = this.classNumber(this.form.className);
    if (!n || cls === null) return;

    const match = n.drawingDivisions.find(
      d => (d.minClass ?? 0) <= cls && cls <= (d.maxClass ?? 99));

    if (match) this.form.drawingGroupId = match.id;
  }

  /** Suggests the dance group from the date of birth, for the same reason. */
  protected suggestDance(): void {
    const n = this.notice();
    if (!n || !this.form.dateOfBirth) return;

    const age = this.ageOn(new Date(this.form.dateOfBirth), n.eventDate ? new Date(n.eventDate) : new Date());

    const match = n.danceGroups.find(
      g => (g.minAge ?? 0) <= age && age <= (g.maxAge ?? 200));

    if (match) this.form.danceGroupId = match.id;
  }

  protected groupLabel(group: CompetitionGroup): string {
    return group.labelBengali ? `${group.labelEnglish} · ${group.labelBengali}` : group.labelEnglish;
  }

  protected openForm(): void {
    this.rulesAccepted.set(true);
    this.stage.set('quickstart');

    // The panel is below the notice on the same page; bring it into view rather
    // than leaving the reader wondering whether the button did anything.
    setTimeout(() => document.getElementById('cmp-quickstart')?.scrollIntoView({ behavior: 'smooth' }), 0);
  }

  private enterFullForm(name: string, phone: string): void {
    this.form.participantName = name;
    this.form.phone = phone;
    this.stage.set('form');
    setTimeout(() => document.getElementById('cmp-form')?.scrollIntoView({ behavior: 'smooth' }), 0);
  }

  protected startDraft(): void {
    const name = this.quickStart.participantName.trim();
    const phone = this.quickStart.phone.trim();
    const email = this.quickStart.email.trim();
    const password = this.quickStart.password;

    if (!name) { this.quickStartError.set("Enter the participant's name."); return; }
    if (!/^[0-9]{10}$/.test(phone)) { this.quickStartError.set('Enter a 10-digit phone number.'); return; }
    // Loose on purpose — the server is the real check, this just catches an empty
    // or obviously wrong field before a round trip. It's also the only place a
    // forgotten password can send a reset code, so it isn't optional.
    if (!/^\S+@\S+\.\S+$/.test(email)) { this.quickStartError.set('Enter a valid email address.'); return; }
    if (password.length < 6) { this.quickStartError.set('Choose a password at least 6 characters long.'); return; }

    this.quickStartSaving.set(true);
    this.quickStartError.set(null);

    this.competitions.startDraft({ participantName: name, phone, email, password }).subscribe({
      next: response => {
        this.quickStartSaving.set(false);

        if (response.success === false) {
          this.quickStartError.set(response.message ?? 'That could not be started.');
          return;
        }

        this.draftCode.set(response.data!.registrationCode);
        this.draftJustStarted.set(true);
        this.enterFullForm(response.data!.participantName, phone);
      },
      error: err => {
        this.quickStartSaving.set(false);
        this.quickStartError.set(err?.error?.message ?? 'That could not be started.');
      }
    });
  }

  protected resumeDraft(): void {
    const code = this.resumeLogin.registrationCode.trim();
    const password = this.resumeLogin.password;

    if (!code || !password) {
      this.quickStartError.set('Enter your registration id and password.');
      return;
    }

    this.quickStartSaving.set(true);
    this.quickStartError.set(null);

    this.competitions.resumeDraft({ registrationCode: code, password }).subscribe({
      next: response => {
        this.quickStartSaving.set(false);

        if (response.success === false) {
          this.quickStartError.set(response.message ?? 'That registration could not be found.');
          return;
        }

        const draft = response.data!;

        if (draft.status === 'Completed') {
          this.quickStartError.set(
            'This registration is already complete. Use the "Already registered?" lookup below to get the chest number.'
          );
          return;
        }

        this.draftCode.set(draft.registrationCode);
        this.draftJustStarted.set(false);
        this.enterFullForm(draft.participantName, draft.phone);
      },
      error: err => {
        this.quickStartSaving.set(false);
        this.quickStartError.set(err?.error?.message ?? 'That registration could not be found.');
      }
    });
  }

  /** Step one of recovery: send the code. Always moves on — the server never says
   *  whether the registration id matched anything. */
  protected sendForgotPasswordCode(): void {
    const code = this.forgotRegistrationCode.trim();

    if (!code) {
      this.forgotError.set('Enter your registration id.');
      return;
    }

    this.forgotSaving.set(true);
    this.forgotError.set(null);

    this.competitions.forgotDraftPassword({ registrationCode: code }).subscribe({
      next: () => {
        this.forgotSaving.set(false);
        this.forgotSent.set(true);
      },
      error: err => {
        this.forgotSaving.set(false);
        this.forgotError.set(err?.error?.message ?? 'Something went wrong. Please try again.');
      }
    });
  }

  /** Step two: the emailed code, spent to set a new password without the old one. */
  protected submitDraftPasswordReset(): void {
    const code = this.forgotRegistrationCode.trim();

    if (this.resetCode.length !== 6) {
      this.resetError.set('Enter the 6-digit code from the email.');
      return;
    }

    if (this.resetNewPassword.length < 6) {
      this.resetError.set('Choose a new password at least 6 characters long.');
      return;
    }

    this.resetSaving.set(true);
    this.resetError.set(null);

    this.competitions.resetDraftPassword({
      registrationCode: code,
      code: this.resetCode,
      newPassword: this.resetNewPassword
    }).subscribe({
      next: response => {
        this.resetSaving.set(false);

        if (response.success === false) {
          this.resetError.set(response.message ?? 'That code could not be verified.');
          return;
        }

        this.resetDone.set(true);
      },
      error: err => {
        this.resetSaving.set(false);
        this.resetError.set(err?.error?.message ?? 'That code could not be verified.');
      }
    });
  }

  /** Back to plain sign-in, from anywhere in the forgot/reset flow. */
  protected cancelForgotPassword(): void {
    this.showForgotPassword.set(false);
    this.forgotSent.set(false);
    this.forgotError.set(null);
    this.resetError.set(null);
    this.resetDone.set(false);
    this.forgotRegistrationCode = '';
    this.resetCode = '';
    this.resetNewPassword = '';
  }

  protected submitPasswordChange(): void {
    const code = this.draftCode();
    if (!code) return;

    if (this.changePassword.newPassword.length < 6) {
      this.passwordChangeError.set('Choose a new password at least 6 characters long.');
      return;
    }

    this.passwordChangeSaving.set(true);
    this.passwordChangeError.set(null);

    this.competitions.changeDraftPassword({
      registrationCode: code,
      currentPassword: this.changePassword.currentPassword,
      newPassword: this.changePassword.newPassword
    }).subscribe({
      next: response => {
        this.passwordChangeSaving.set(false);

        if (response.success === false) {
          this.passwordChangeError.set(response.message ?? 'That password could not be changed.');
          return;
        }

        this.passwordChanged.set(true);
        this.changingPassword.set(false);
        this.changePassword = { currentPassword: '', newPassword: '' };
      },
      error: err => {
        this.passwordChangeSaving.set(false);
        this.passwordChangeError.set(err?.error?.message ?? 'That password could not be changed.');
      }
    });
  }

  /* ---------------------------------------------------------- the uploads */

  protected async pick(event: Event, into: 'photo' | 'schoolId' | 'birthCertificate' | 'paymentSlip'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const upload = await this.shrink(file);

      switch (into) {
        case 'photo': this.photo.set(upload); break;
        case 'schoolId': this.schoolId.set(upload); break;
        case 'birthCertificate': this.birthCertificate.set(upload); break;
        case 'paymentSlip': this.paymentSlip.set(upload); break;
      }

      this.error.set(null);
    } catch {
      this.error.set(`That file could not be read as an image. Please choose a photo or a scan.`);
    }
  }

  /**
   * Redraws the chosen picture no larger than 1400px on its longest side.
   *
   * <p>A phone camera file is three or four megabytes; a school id card only has to
   * be legible. Shrinking here means a parent on a slow connection is not left
   * watching an upload bar having already paid.</p>
   */
  private shrink(file: File): Promise<CompetitionUpload> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        URL.revokeObjectURL(url);

        const edge = 1400;
        const scale = Math.min(1, edge / Math.max(image.width, image.height));

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);

        const context = canvas.getContext('2d');
        if (!context) { reject(new Error('no canvas')); return; }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1] ?? '';

        resolve({
          fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
          contentType: 'image/jpeg',
          base64
        });
      };

      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
      image.src = url;
    });
  }

  /* ----------------------------------------------------------- submitting */

  protected submit(): void {
    const problem = this.firstProblem();

    if (problem) {
      this.error.set(problem);
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    const request: CompetitionRegisterRequest = {
      participantName: this.form.participantName.trim(),
      guardianName: this.form.guardianName.trim() || null,
      dateOfBirth: this.form.dateOfBirth || null,
      schoolName: this.form.schoolName.trim() || null,
      className: this.form.className.trim() || null,
      phone: this.form.phone.trim(),
      email: this.form.email.trim() || null,
      address: this.form.address.trim() || null,
      drawingGroupId: this.enterDrawing() ? this.form.drawingGroupId : null,
      danceGroupId: this.enterDance() ? this.form.danceGroupId : null,
      paymentMode: this.venueAllowed() ? this.form.paymentMode : 'Online',
      transactionRef: this.form.transactionRef.trim() || null,
      photo: this.photo(),
      schoolId: this.enterDrawing() ? this.schoolId() : null,
      birthCertificate: this.enterDance() ? this.birthCertificate() : null,
      paymentSlip: this.paymentSlip(),
      rulesAccepted: this.rulesAccepted(),
      draftCode: this.draftCode()
    };

    this.competitions.register(request).subscribe({
      next: response => {
        this.saving.set(false);

        if (response.success === false) {
          this.error.set(response.message ?? 'The registration could not be saved.');
          return;
        }

        this.result.set(response.data);
        this.stage.set('done');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'The registration could not be saved.');
      }
    });
  }

  /**
   * The first thing wrong with the form, in the order a person fills it in.
   *
   * <p>One message at a time rather than a wall of red: the reader fixes it and the
   * next one appears, which is how a paper form is corrected at a desk.</p>
   */
  private firstProblem(): string | null {
    if (!this.form.participantName.trim()) return 'Enter the participant\'s name.';
    if (!/^[0-9]{10}$/.test(this.form.phone.trim())) return 'Enter a 10-digit phone number.';
    if (!this.enterDrawing() && !this.enterDance()) return 'Choose drawing, dance, or both.';
    if (this.enterDrawing() && !this.form.className.trim()) {
      return 'Enter the participant\'s school class — it decides the drawing division.';
    }
    if (this.enterDrawing() && !this.form.drawingGroupId) return 'Choose the drawing division.';
    if (this.enterDance() && !this.form.danceGroupId) return 'Choose the dance group.';
    if (this.enterDance() && !this.form.dateOfBirth) return 'Enter the date of birth — it decides the dance group.';
    if (!this.photo()) return 'Upload the participant\'s photograph.';
    if (this.enterDrawing() && !this.schoolId()) return 'Upload the school id card.';
    if (this.enterDance() && !this.birthCertificate()) return 'Upload the birth certificate.';

    const online = !this.venueAllowed() || this.form.paymentMode === 'Online';

    if (online && this.form.transactionRef.trim().length < 6) {
      return 'Enter the UPI reference number from your payment app.';
    }

    if (online && !this.paymentSlip()) return 'Upload the payment screenshot.';

    return null;
  }

  /**
   * Prints the registration, chest number and all.
   *
   * <p>The dancer pins this on: "candidate able to download Batch like 1,2 etc,
   * which will taken printout and kept in chest at the time of dance". Printed from
   * the page rather than generated as a PDF on the server, so it works on a phone
   * with no reader installed — the browser's own print dialogue offers Save as PDF.</p>
   */
  protected print(): void {
    window.print();
  }

  protected startAnother(): void {
    this.result.set(null);
    this.error.set(null);
    this.rulesAccepted.set(false);
    this.enterDrawing.set(false);
    this.enterDance.set(false);
    this.photo.set(null);
    this.schoolId.set(null);
    this.birthCertificate.set(null);
    this.paymentSlip.set(null);

    this.form = {
      participantName: '', guardianName: '', dateOfBirth: '', schoolName: '',
      className: '', phone: '', email: '', address: '',
      drawingGroupId: null, danceGroupId: null, paymentMode: 'Online', transactionRef: ''
    };

    this.draftCode.set(null);
    this.draftJustStarted.set(false);
    this.quickStartMode.set('start');
    this.quickStartError.set(null);
    this.quickStart = { participantName: '', phone: '', email: '', password: '' };
    this.resumeLogin = { registrationCode: '', password: '' };
    this.changingPassword.set(false);
    this.passwordChanged.set(false);
    this.changePassword = { currentPassword: '', newPassword: '' };

    this.stage.set('notice');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* -------------------------------------------------------------- helpers */

  /* --------------------------------------------- chest number download */

  readonly lookup = { registrationNo: '', phone: '' };
  readonly lookupError = signal<string | null>(null);
  readonly lookupBusy = signal(false);

  /**
   * Fetches the chest number sheet for somebody who registered earlier.
   *
   * <p>Through HttpClient rather than a plain link, so a refusal -- payment not yet
   * confirmed, wrong phone number -- can be read out of the response and shown as a
   * sentence, instead of the browser opening a page of JSON.</p>
   */
  protected downloadChestCard(): void {
    const number = this.lookup.registrationNo.trim();
    const phone = this.lookup.phone.trim();

    if (!number || !phone) {
      this.lookupError.set('Enter your registration number and phone number.');
      return;
    }

    this.lookupBusy.set(true);
    this.lookupError.set(null);

    this.competitions.chestCard(number, phone).subscribe({
      next: blob => {
        this.lookupBusy.set(false);

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `chest-number-${number.replace(/\//g, '-')}.pdf`;
        link.click();

        // Freed on the next tick; revoking at once can cancel the download.
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      },
      error: async err => {
        this.lookupBusy.set(false);

        /* The refusal arrives as JSON inside a Blob, because the request asked for
           a file. Read it back so the reason reaches the reader. */
        let message = 'That chest number could not be downloaded.';

        try {
          const text = await (err?.error as Blob).text();
          message = JSON.parse(text)?.message ?? message;
        } catch { /* keep the general message */ }

        this.lookupError.set(message);
      }
    });
  }

  /** Where the portal reads a poster from. Anonymous, so a plain URL is fine. */
  protected advertUrl(slot: 'Drawing' | 'Dance'): string {
    const n = this.notice();
    return n ? this.competitions.advertUrl(n.competitionId, slot) : '';
  }

  protected rulesLines(text: string | undefined): string[] {
    return (text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  }

  protected time(value: string | undefined): string {
    if (!value) return '';

    const [h, m] = value.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 === 0 ? 12 : h % 12;

    return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  private classNumber(value: string): number | null {
    const roman: Record<string, number> = {
      i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12
    };

    const text = value.trim().toLowerCase();
    if (!text) return null;

    if (/^nursery|^kg|^lkg|^ukg|^pre/.test(text)) return 0;
    if (roman[text] !== undefined) return roman[text];

    const digits = parseInt(text.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(digits) ? digits : null;
  }

  private ageOn(dob: Date, on: Date): number {
    let age = on.getFullYear() - dob.getFullYear();
    const before = on.getMonth() < dob.getMonth()
      || (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate());

    if (before) age--;
    return age;
  }
}
