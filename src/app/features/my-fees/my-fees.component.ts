import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { toDataURL } from 'qrcode';

import { ApiResponse } from '../../core/models/api-response.model';
import { MyFeeDue } from '../../core/models/fee.model';
import { FeeService } from '../../core/services/fee.service';

/**
 * A student paying their monthly fee from the portal, against the institute's
 * shared UPI QR code.
 *
 * The QR is a static merchant code — there is no gateway and no callback — so the
 * student pays in their own app and then types the UPI reference here. Nothing on
 * this screen can confirm the money arrived; the office checks the reference
 * against the Paytm account afterwards, and the page says so plainly rather than
 * implying a payment has been verified.
 */
@Component({
  selector: 'app-my-fees',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule],
  templateUrl: './my-fees.component.html',
  styleUrl: './my-fees.component.scss'
})
export class MyFeesComponent {
  private readonly fees = inject(FeeService);
  private readonly messages = inject(MessageService);

  readonly due = signal<MyFeeDue | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly paid = signal(false);

  readonly reference = signal('');

  /** UPI references are letters and digits; most banks issue 12 digits. */
  readonly referenceValid = computed(() => /^[A-Za-z0-9-]{6,64}$/.test(this.reference().trim()));

  /**
   * The `upi://pay` link behind the QR. Built from the institute's own id and the
   * exact amount owed, so a student tapping it on a phone gets the amount filled
   * in rather than typing it — and cannot mistype it.
   */
  readonly upiLink = computed(() => {
    const d = this.due();
    if (!d?.upiId) return null;

    const params = new URLSearchParams({
      pa: d.upiId,
      pn: d.payeeName ?? 'Avijan',
      am: d.amountPayable.toFixed(2),
      cu: 'INR',
      tn: `Fee ${d.registrationId}`
    });

    return `upi://pay?${params.toString()}`;
  });

  /** The generated QR, as a data URL. */
  readonly qrDataUrl = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.fees.myDue().subscribe({
      next: data => {
        this.due.set(data);
        this.loading.set(false);
        this.buildQr();
      },
      error: () => {
        this.due.set(null);
        this.loading.set(false);
      }
    });
  }

  /**
   * Draws the QR for this student's exact amount.
   *
   * Generated rather than showing the institute's printed code, because the
   * printed one is static: it carries the merchant id and nothing else, so the
   * student has to type the amount themselves and a slip of the finger pays the
   * wrong sum. This encodes ₹ and the reference note as well, so scanning it fills
   * everything in and there is nothing left to get wrong.
   *
   * Error correction is set high so the code still scans from a phone held at an
   * angle, or off a slightly dirty screen.
   */
  private buildQr(): void {
    const link = this.upiLink();

    if (!link) {
      this.qrDataUrl.set(null);
      return;
    }

    toDataURL(link, { errorCorrectionLevel: 'H', margin: 1, width: 320 })
      .then(url => this.qrDataUrl.set(url))
      .catch(() => this.qrDataUrl.set(null));
  }

  /**
   * Saves the QR as a picture, for paying from this same phone.
   *
   * A phone cannot scan its own screen, and Google Pay, PhonePe and Paytm often
   * refuse a payment to a merchant UPI ID opened from a web link ("cannot be
   * completed for security reasons", or a low limit) — a rule of the UPI apps,
   * not a fault in the ID. Every one of them can read a QR from the gallery
   * ("Scan QR" → gallery / upload), and that route carries the same amount.
   */
  saveQr(): void {
    const qr = this.qrDataUrl();
    const d = this.due();
    if (!qr || !d) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `Avijan-fee-QR-${d.registrationId.replace(/[^A-Za-z0-9]+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  submit(): void {
    const d = this.due();

    if (!d?.canPay || !this.referenceValid() || this.submitting()) return;

    this.submitting.set(true);

    this.fees.payOnline(this.reference().trim()).subscribe({
      next: response => {
        this.submitting.set(false);
        this.paid.set(true);

        this.messages.add({
          severity: 'success',
          summary: 'Payment recorded',
          detail:
            `Bill ${response.data.billNo}. The office will confirm it against the ` +
            'institute account shortly.',
          life: 9000
        });
      },
      error: (error: unknown) => {
        this.submitting.set(false);

        // A duplicate reference is the likeliest failure and needs to be read, not
        // glanced at, so it is surfaced here as well as in the toast.
        if (error instanceof HttpErrorResponse) {
          const body = error.error as ApiResponse<unknown> | null;
          if (body?.message) this.submitError.set(body.message);
        }
      }
    });
  }

  readonly submitError = signal<string | null>(null);


  payAgain(): void {
    this.paid.set(false);
    this.reference.set('');
    this.submitError.set(null);
    this.load();
  }
}
