import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CertificateService, CertificateVerification } from '../../core/services/certificate.service';

/**
 * What an employer or college sees after scanning a certificate's QR code:
 * whether Avijan issued it, and to whom. Public, no sign-in.
 */
@Component({
  selector: 'app-certificate-verify',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="cv">
      <div class="cv__card">
        <a routerLink="/" class="cv__logo"><img src="images/logo.png" alt="Avijan" /></a>
        <h1>Certificate verification</h1>

        @if (loading()) {
          <p class="cv__muted">Checking…</p>
        } @else {
        @if (result(); as r) {
          <div class="cv__ok"><i class="pi pi-verified"></i> Genuine certificate issued by Avijan</div>
          <dl>
            <dt>Certificate No.</dt><dd>{{ r.certificateNo }}</dd>
            <dt>Student</dt><dd>{{ r.studentName || '—' }}</dd>
            <dt>Registration No.</dt><dd>{{ r.registrationId || '—' }}</dd>
            <dt>Course</dt><dd>{{ r.courseName || '—' }}</dd>
            @if (r.grade) { <dt>Grade</dt><dd>{{ r.grade }}</dd> }
            @if (r.completedOn) { <dt>Completed</dt><dd>{{ r.completedOn | date: 'd MMMM y' }}</dd> }
            <dt>Issued</dt><dd>{{ r.issuedOn | date: 'd MMMM y, h:mm a' }}@if (r.isDuplicate) { — duplicate copy no. {{ r.issueNo }} }</dd>
          </dl>
          <p class="cv__muted">Check that these details match the certificate in front of you.</p>
        } @else {
          <div class="cv__bad"><i class="pi pi-times-circle"></i> This certificate could not be verified</div>
          <p class="cv__muted">The code is not one Avijan issued. If you scanned it from a certificate, please contact
            Avijan on +91-7688045949 or mail.avijan&#64;gmail.com.</p>
        }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #f4f6fb; }
    .cv { display: grid; place-items: center; min-height: 100vh; padding: 1rem; }
    .cv__card { width: min(32rem, 100%); background: #fff; border-radius: 16px; padding: 1.6rem 1.4rem;
      border: 1px solid #e6e8ef; box-shadow: 0 16px 36px -22px rgba(10,40,60,.5); font-family: inherit; }
    .cv__logo img { height: 40px; }
    h1 { margin: 0.8rem 0 1rem; font-size: 1.35rem; color: #0a283c; }
    .cv__ok, .cv__bad { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; padding: 0.7rem 0.9rem; border-radius: 10px; }
    .cv__ok { background: #e7f6ec; color: #1f7a3f; }
    .cv__bad { background: #fdecec; color: #b42318; }
    .cv__ok .pi, .cv__bad .pi { font-size: 1.3rem; }
    dl { display: grid; grid-template-columns: 9rem 1fr; gap: 0.45rem 0.8rem; margin: 1rem 0; }
    dt { color: #66708a; }
    dd { margin: 0; font-weight: 600; color: #1f2a44; }
    .cv__muted { color: #66708a; font-size: 0.88rem; }
  `]
})
export class CertificateVerifyComponent implements OnInit {
  private readonly certificates = inject(CertificateService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly result = signal<CertificateVerification | null>(null);

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code') ?? '';
    this.certificates.verify(code).subscribe({
      next: r => { this.result.set(r); this.loading.set(false); },
      error: () => { this.result.set(null); this.loading.set(false); }
    });
  }
}
