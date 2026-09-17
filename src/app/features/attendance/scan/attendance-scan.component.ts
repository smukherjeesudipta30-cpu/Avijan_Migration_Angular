import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { ApiResponse } from '../../../core/models/api-response.model';
import { AttendanceChallenge, AttendanceScanResult } from '../../../core/models/attendance.model';
import { AttendanceService } from '../../../core/services/attendance.service';

/**
 * The page the QR code opens on a phone.
 *
 * <p>It asks the browser for the device's location and sends that with the code
 * from the QR. The server decides everything that matters — whether the phone is
 * inside the centre, and whether this is an arrival or a departure. Nothing here
 * is trusted, and nothing here can be argued with by editing the page.</p>
 *
 * <p>The location prompt is the one thing a person must agree to. Refusing it is
 * treated as a plain, recoverable outcome rather than an error, because on a phone
 * it usually means they tapped the wrong button.</p>
 */
@Component({
  selector: 'app-attendance-scan',
  imports: [CommonModule, ButtonModule, InputTextModule, RouterLink],
  templateUrl: './attendance-scan.component.html',
  styleUrl: './attendance-scan.component.scss'
})
export class AttendanceScanComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly attendance = inject(AttendanceService);

  readonly busy = signal(false);
  readonly result = signal<AttendanceScanResult | null>(null);
  readonly error = signal<string | null>(null);

  /** What the phone is doing right now, so the wait is not a blank screen. */
  readonly stage = signal<'idle' | 'locating' | 'sending'>('idle');

  private readonly token = this.route.snapshot.queryParamMap.get('t') ?? '';

  readonly hasToken = this.token.length > 0;

  constructor() {
    // Straight in: the person has already scanned, and asking them to press a
    // second button at the door is a step nobody wants at nine in the morning.
    if (this.hasToken) this.mark();
  }

  mark(): void {
    if (this.busy() || !this.hasToken) return;

    this.busy.set(true);
    this.error.set(null);
    this.result.set(null);
    this.stage.set('locating');

    if (!navigator.geolocation) {
      this.fail(
        'This browser cannot report its location, so attendance cannot be marked. ' +
        'Try scanning with your phone camera instead.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => this.send(position),
      failure => this.locationRefused(failure),
      {
        // A cached fix from this morning would place someone at the centre from
        // home, so it is refused; and a phone indoors needs time to settle.
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000
      }
    );
  }

  /* The mark is held until the emailed code is entered, so the scan produces a
     challenge rather than a finished result. */
  readonly challenge = signal<AttendanceChallenge | null>(null);
  readonly code = signal('');
  readonly confirming = signal(false);

  onCodeInput(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    this.code.set(digits);

    if (digits.length === 6) this.confirm();
  }

  confirm(): void {
    const pending = this.challenge();
    if (!pending || this.confirming() || this.code().length !== 6) return;

    this.confirming.set(true);
    this.error.set(null);

    this.attendance.confirm(pending.challengeId, this.code()).subscribe({
      next: response => {
        this.result.set(response.data);
        this.challenge.set(null);
        this.confirming.set(false);
      },
      error: (error: unknown) => {
        const message = error instanceof HttpErrorResponse
          ? (error.error as ApiResponse<unknown> | null)?.message
          : null;

        this.error.set(message ?? 'That code could not be checked.');
        this.confirming.set(false);
        this.code.set('');
      }
    });
  }

  private send(position: GeolocationPosition): void {
    this.stage.set('sending');

    this.attendance
      .scan({
        token: this.token,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMetres: position.coords.accuracy
      })
      .subscribe({
        next: response => {
          this.challenge.set(response.data);
          this.busy.set(false);
          this.stage.set('idle');
        },
        error: (error: unknown) => {
          const message = error instanceof HttpErrorResponse
            ? (error.error as ApiResponse<unknown> | null)?.message
            : null;

          this.fail(message ?? 'That scan could not be recorded. Please try again.');
        }
      });
  }

  private locationRefused(failure: GeolocationPositionError): void {
    // Named separately because each one has a different thing for the person to do.
    const message = failure.code === failure.PERMISSION_DENIED
      ? 'Attendance needs your location to confirm you are at the centre. Allow ' +
        'location for this site in your browser, then scan again.'
      : failure.code === failure.TIMEOUT
        ? 'Your phone took too long to find its location. Step near a window or ' +
          'outside the door, then scan again.'
        : 'Your location could not be read. Turn on GPS and scan again.';

    this.fail(message);
  }

  private fail(message: string): void {
    this.error.set(message);
    this.busy.set(false);
    this.stage.set('idle');
  }
}
