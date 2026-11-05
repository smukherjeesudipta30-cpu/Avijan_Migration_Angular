import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import * as QRCode from 'qrcode';

import { ApiResponse } from '../../core/models/api-response.model';
import { AttendanceChallenge, AttendanceQr, MyAttendance } from '../../core/models/attendance.model';
import { AttendanceService } from '../../core/services/attendance.service';
import { AuthService } from '../../core/services/auth.service';

/**
 * The attendance screen: the QR code to put on display at the centre, and the
 * signed-in person's own day beside it.
 *
 * <p>The code is re-fetched a few seconds before it expires. That is the whole
 * defence against a photographed QR — a picture of this screen is useless within
 * about a minute and a half.</p>
 */
@Component({
  selector: 'app-attendance',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TagModule],
  templateUrl: './attendance.component.html',
  styleUrl: './attendance.component.scss'
})
export class AttendanceComponent implements OnDestroy {
  private readonly attendance = inject(AttendanceService);
  private readonly auth = inject(AuthService);

  /**
   * Whether this person marks their own attendance.
   *
   * An administrator has no teacher or receptionist record, so "my day" is not
   * merely empty for them — the endpoint behind it refuses them outright, which
   * showed as a "Not permitted" toast on a page they are entitled to open. They
   * come here to put the code on a screen, and that is all they are shown.
   */
  readonly marksOwnAttendance = computed(() =>
    // The PreSchool's receptionist and teachers use this same screen at
    // /preschool/attendance, where it talks to the PreSchool's attendance.
    this.auth.hasAnyRole(['Teacher', 'Receptionist', 'PreSchoolFrontDesk', 'PreSchoolTutor']));

  readonly qr = signal<AttendanceQr | null>(null);
  readonly qrImage = signal<string | null>(null);
  readonly qrError = signal<string | null>(null);

  readonly me = signal<MyAttendance | null>(null);
  readonly loadingMe = signal(false);

  /** Seconds until the displayed code dies, shown so nobody scans a stale one. */
  readonly secondsLeft = signal(0);

  readonly hoursLabel = computed(() => {
    const hours = this.me()?.hoursToday;
    return hours === null || hours === undefined ? '—' : `${hours.toFixed(2)} h`;
  });

  /** The countdown to the scan-out deadline, in plain words. */
  readonly deadlineLabel = computed(() => {
    const mine = this.me();
    if (!mine?.isCurrentlyIn) return null;

    const minutes = mine.minutesLeftToScanOut;
    if (minutes === null || minutes === undefined) return null;
    if (minutes <= 0) return 'The deadline has passed — today counts as leave.';

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    return h > 0
      ? `Scan out within ${h} h ${m} min or today counts as leave.`
      : `Scan out within ${m} min or today counts as leave.`;
  });

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.loadQr();

    // Not asked for at all unless it applies — see marksOwnAttendance.
    if (this.marksOwnAttendance()) this.loadMe();

    this.tickTimer = setInterval(() => {
      this.secondsLeft.update(s => (s > 0 ? s - 1 : 0));
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    if (this.tickTimer !== null) clearInterval(this.tickTimer);
  }

  /* ------------------------------------------- marking from this device */

  readonly marking = signal(false);
  readonly markError = signal<string | null>(null);
  readonly markResult = signal<string | null>(null);

  /* The mark is held here until the emailed code confirms it. Nothing reaches the
     attendance record while this is set. */
  readonly challenge = signal<AttendanceChallenge | null>(null);
  readonly code = signal('');
  readonly confirming = signal(false);
  readonly resending = signal(false);

  /** Types the six digits and, on the sixth, submits without another tap. */
  onCodeInput(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    this.code.set(digits);

    if (digits.length === 6) this.confirm();
  }

  confirm(): void {
    const pending = this.challenge();
    if (!pending || this.confirming() || this.code().length !== 6) return;

    this.confirming.set(true);
    this.markError.set(null);

    this.attendance.confirm(pending.challengeId, this.code()).subscribe({
      next: response => {
        this.challenge.set(null);
        this.code.set('');
        this.markResult.set(response.data.message);
        this.confirming.set(false);
        this.loadMe();
      },
      error: (error: unknown) => {
        const message = error instanceof HttpErrorResponse
          ? (error.error as ApiResponse<unknown> | null)?.message
          : null;

        this.markError.set(message ?? 'That code could not be checked. Try again.');
        this.confirming.set(false);
        this.code.set('');
      }
    });
  }

  resend(): void {
    const pending = this.challenge();
    if (!pending || this.resending()) return;

    this.resending.set(true);
    this.markError.set(null);

    this.attendance.resend(pending.challengeId).subscribe({
      next: response => {
        this.challenge.set(response.data);
        this.markResult.set(response.data.message);
        this.resending.set(false);
      },
      error: () => {
        this.markError.set('The code could not be sent again.');
        this.resending.set(false);
      }
    });
  }

  /** Abandons a pending mark, for somebody who marked by mistake. */
  cancelPending(): void {
    this.challenge.set(null);
    this.code.set('');
    this.markResult.set(null);
    this.markError.set(null);
  }

  /**
   * Marks attendance from this phone, with nothing to scan.
   *
   * The QR is for a screen at the centre — a phone cannot photograph a code shown
   * on its own display, so a staff member who opens the site on their mobile needs
   * this instead. The location check is identical either way.
   */
  markHere(): void {
    if (this.marking()) return;

    this.marking.set(true);
    this.markError.set(null);
    this.markResult.set(null);

    if (!navigator.geolocation) {
      this.markError.set('This browser cannot report its location.');
      this.marking.set(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        this.attendance
          .mark(position.coords.latitude, position.coords.longitude, position.coords.accuracy)
          .subscribe({
            next: response => {
              // Not recorded yet — it waits for the code that has just been emailed.
              this.challenge.set(response.data);
              this.markResult.set(response.data.message);
              this.marking.set(false);
              this.code.set('');
            },
            error: (error: unknown) => {
              const message = error instanceof HttpErrorResponse
                ? (error.error as ApiResponse<unknown> | null)?.message
                : null;

              this.markError.set(message ?? 'That could not be recorded. Please try again.');
              this.marking.set(false);
            }
          });
      },
      failure => {
        this.markError.set(
          failure.code === failure.PERMISSION_DENIED
            ? 'Attendance needs your location. Allow location for this site, then try again.'
            : 'Your location could not be read. Turn on GPS and try again.');
        this.marking.set(false);
      },
      // No cached fix: a position from this morning would place someone at the
      // centre from home.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }

  loadMe(): void {
    this.loadingMe.set(true);

    this.attendance.me().subscribe({
      next: mine => {
        this.me.set(mine);
        this.loadingMe.set(false);
      },
      error: () => this.loadingMe.set(false)
    });
  }

  private loadQr(): void {
    this.attendance.qr().subscribe({
      next: async code => {
        this.qr.set(code);
        this.qrError.set(null);
        this.secondsLeft.set(code.secondsValid);

        try {
          this.qrImage.set(await QRCode.toDataURL(code.scanUrl, {
            width: 320,
            margin: 1,
            errorCorrectionLevel: 'M'
          }));
        } catch {
          // The URL is still shown below, so a failed drawing is not a dead end.
          this.qrImage.set(null);
        }

        /* Renewed a few seconds early. Swapping the image exactly on expiry would
           leave a moment where the code on screen no longer works. */
        const renewIn = Math.max(10, code.secondsValid - 8) * 1000;

        if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.loadQr(), renewIn);
      },
      error: () => {
        this.qrError.set(
          'The code could not be issued. The centre may not have its location set yet.');
        this.qrImage.set(null);
      }
    });
  }
}
