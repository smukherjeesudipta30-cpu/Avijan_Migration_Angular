import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { StudentCertificate } from '../../core/models/report.model';
import { certificateHtml } from '../../core/printing/legacy-documents';
import { CertificateService } from '../../core/services/certificate.service';

/** An uploaded picture, cleaned up: white paper made transparent, trimmed, sized. */
interface CleanImage { contentType: string; base64: string; dataUrl: string; }

/**
 * Who signs the completion certificate: name, title, the signature (and an
 * optional stamp), with a live preview on a sample certificate. Admin only.
 */
@Component({
  selector: 'app-certificate-settings',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Certificates</span>
      <h1>Certificate signature</h1>
      <p class="app-muted">The signature printed on every completion certificate, with the download date and a QR code
        anyone can scan to check the certificate is genuine.</p>
    </div>

    <div class="cs__grid">
      <section class="app-card cs__form">
        <label>Signatory's name <em>*</em><input pInputText [ngModel]="name()" (ngModelChange)="name.set($event)" maxlength="100" placeholder="Anindita Mukherjee" /></label>
        <label>Title <em>*</em><input pInputText [ngModel]="title()" (ngModelChange)="title.set($event)" maxlength="100" placeholder="Proprietor" /></label>

        <div class="cs__upload">
          <span>Signature <small>— sign in dark ink on plain white paper, then photograph or scan it</small></span>
          @if (signature(); as s) {
            <div class="cs__thumb"><img [src]="s" alt="Signature" /></div>
            <button type="button" class="cs__link" (click)="signature.set(null); removeSignature = true; signatureNew = null">Remove</button>
          } @else {
            <p class="app-muted">No signature uploaded — the certificate will have a blank line to sign by hand.</p>
          }
          <label class="cs__pick"><i class="pi pi-upload"></i> {{ signature() ? 'Replace' : 'Upload' }} signature
            <input type="file" accept="image/png,image/jpeg" (change)="pick($event, 'signature')" /></label>
        </div>

        <div class="cs__upload">
          <span>Stamp <small>— optional, the institute's round or rectangle stamp</small></span>
          @if (stamp(); as s) {
            <div class="cs__thumb"><img [src]="s" alt="Stamp" /></div>
            <button type="button" class="cs__link" (click)="stamp.set(null); removeStamp = true; stampNew = null">Remove</button>
          }
          <label class="cs__pick"><i class="pi pi-upload"></i> {{ stamp() ? 'Replace' : 'Upload' }} stamp
            <input type="file" accept="image/png,image/jpeg" (change)="pick($event, 'stamp')" /></label>
        </div>

        <div class="cs__actions">
          <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
          @if (modifiedOn()) { <small class="app-muted">Last changed {{ modifiedOn() | date: 'd MMM y, h:mm a' }}</small> }
        </div>
      </section>

      <section class="app-card cs__preview">
        <h2>Preview</h2>
        <p class="app-muted">A sample certificate with this signature, the download date and a QR code.</p>
        <div class="cs__frame-wrap"><iframe #frame title="Certificate preview" [attr.srcdoc]="previewHtml()"></iframe></div>
      </section>
    </div>
  `,
  styles: [`
    .cs__grid { display: grid; grid-template-columns: minmax(18rem, 26rem) 1fr; gap: 1rem; align-items: start; }
    .cs__form { display: flex; flex-direction: column; gap: 0.9rem; }
    .cs__form > label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 600; }
    .cs__form em { color: #b42318; font-style: normal; }
    .cs__upload { border: 1px dashed var(--app-border); border-radius: 10px; padding: 0.7rem; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.85rem; font-weight: 600; }
    .cs__upload small { font-weight: 400; color: var(--app-text-muted, #66708a); }
    .cs__thumb { background: repeating-conic-gradient(#f1f3f7 0% 25%, #fff 0% 50%) 50% / 16px 16px; border-radius: 8px; padding: 0.5rem; text-align: center; }
    .cs__thumb img { max-width: 100%; max-height: 110px; }
    .cs__pick { display: inline-flex; align-items: center; gap: 0.4rem; align-self: flex-start; padding: 0.4rem 0.8rem; border-radius: 999px; border: 1px solid var(--app-border); cursor: pointer; font-weight: 600; }
    .cs__pick input { display: none; }
    .cs__link { border: 0; background: none; color: #b42318; font: inherit; font-weight: 600; cursor: pointer; padding: 0; align-self: flex-start; }
    .cs__actions { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
    .cs__preview h2 { margin: 0 0 0.25rem; font-size: 1.05rem; }
    .cs__frame-wrap { position: relative; width: 100%; aspect-ratio: 1122 / 794; overflow: hidden; border: 1px solid var(--app-border); border-radius: 8px; margin-top: 0.6rem; }
    .cs__frame-wrap iframe { position: absolute; top: 0; left: 0; width: 1122px; height: 794px; border: 0; transform-origin: 0 0; }
    @media (max-width: 900px) { .cs__grid { grid-template-columns: 1fr; } }
  `]
})
export class CertificateSettingsComponent implements OnInit {
  private readonly certificates = inject(CertificateService);
  private readonly messages = inject(MessageService);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  readonly name = signal('');
  readonly title = signal('Proprietor');
  private readonly destroyRef = inject(DestroyRef);
  readonly signature = signal<string | null>(null);
  readonly stamp = signal<string | null>(null);
  readonly saving = signal(false);
  readonly modifiedOn = signal<string | null>(null);
  signatureNew: CleanImage | null = null;
  stampNew: CleanImage | null = null;
  removeSignature = false;
  removeStamp = false;
  private readonly tick = signal(0);

  /** The certificate as it would print, with sample student details. */
  readonly previewHtml = computed(() => {
    this.tick();
    const sample: StudentCertificate = {
      studentName: 'Sample Student', guardianName: 'Sample Guardian', registrationId: 'AVI/Raj/0000/26',
      courseName: 'DIPLOMA IN INFORMATION TECHNOLOGY(DIIT)', courseDuration: 12,
      dateOfJoining: '2025-10-01', examDate: '2026-09-30', totalFullMarks: 300, totalObtainedMarks: 240,
      percentScored: 80, grade: 'A', isComplete: true, generatedOn: new Date().toISOString(),
      issueNo: 1, isDuplicate: false, certificateNo: 'AVI-C-000000', verifyCode: 'sample',
      signatoryName: this.name().trim() || 'Signatory name', signatoryTitle: this.title().trim() || 'Proprietor',
      signatureDataUrl: this.signature(), stampDataUrl: this.stamp()
    } as StudentCertificate;
    return certificateHtml(sample).replace(/<button class="print-btn"[\s\S]*?<\/button>/, '');
  });

  ngOnInit(): void {
    this.certificates.settings().subscribe(s => {
      this.name.set(s.signatoryName);
      this.title.set(s.signatoryTitle || 'Proprietor');
      this.signature.set(s.signatureDataUrl);
      this.stamp.set(s.stampDataUrl);
      this.modifiedOn.set(s.modifiedOn);
      setTimeout(() => this.fit());
    });
    // The preview is drawn full size and scaled to fit its box.
    const observer = new ResizeObserver(() => this.fit());
    observer.observe(document.body);
    this.destroyRef.onDestroy(() => observer.disconnect());
    setTimeout(() => this.fit());
  }

  /** Scales the full-size certificate down to the preview box. */
  private fit(): void {
    const frame = this.frame()?.nativeElement;
    const box = frame?.parentElement;
    if (frame && box) frame.style.transform = `scale(${box.clientWidth / 1122})`;
  }

  async pick(event: Event, kind: 'signature' | 'stamp'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const clean = await cleanImage(file, kind === 'signature' ? 700 : 400);
      if (kind === 'signature') {
        this.signatureNew = clean; this.removeSignature = false; this.signature.set(clean.dataUrl);
      } else {
        this.stampNew = clean; this.removeStamp = false; this.stamp.set(clean.dataUrl);
      }
      this.tick.update(v => v + 1);
    } catch {
      this.messages.add({ severity: 'error', summary: 'That picture could not be read', life: 4000 });
    }
  }

  save(): void {
    if (!this.name().trim() || !this.title().trim()) {
      this.messages.add({ severity: 'warn', summary: 'Enter the signatory\'s name and title', life: 4000 });
      return;
    }
    this.saving.set(true);
    this.certificates.save({
      signatoryName: this.name().trim(),
      signatoryTitle: this.title().trim(),
      signatureContentType: this.signatureNew?.contentType ?? null,
      signatureBase64: this.signatureNew?.base64 ?? null,
      stampContentType: this.stampNew?.contentType ?? null,
      stampBase64: this.stampNew?.base64 ?? null,
      removeSignature: this.removeSignature,
      removeStamp: this.removeStamp
    }).subscribe({
      next: s => {
        this.saving.set(false);
        this.signatureNew = null; this.stampNew = null; this.removeSignature = false; this.removeStamp = false;
        this.modifiedOn.set(s.modifiedOn);
        this.messages.add({ severity: 'success', summary: 'Certificate signature saved',
          detail: 'Every certificate downloaded from now on carries it.', life: 4000 });
      },
      error: err => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: err?.error?.message ?? 'Could not save', life: 5000 });
      }
    });
  }
}

/**
 * Makes the white paper around a signature or stamp transparent, trims the
 * empty margin and scales it down, so it sits on the certificate like ink.
 */
async function cleanImage(file: File, maxWidth: number): Promise<CleanImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = url; });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;

    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const light = (px[i] + px[i + 1] + px[i + 2]) / 3;
        if (light > 200) {
          px[i + 3] = 0;                                  // paper → transparent
        } else {
          if (light > 150) px[i + 3] = Math.round(255 * (200 - light) / 50);   // soft edges
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    ctx.putImageData(data, 0, 0);
    if (maxX < 0) throw new Error('blank');

    const pad = 6;
    const sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad);
    const sw = Math.min(canvas.width - sx, maxX - minX + pad * 2), sh = Math.min(canvas.height - sy, maxY - minY + pad * 2);
    const scale = Math.min(1, maxWidth / sw);
    const out = document.createElement('canvas');
    out.width = Math.round(sw * scale);
    out.height = Math.round(sh * scale);
    out.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);

    const dataUrl = out.toDataURL('image/png');
    return { contentType: 'image/png', base64: dataUrl.split(',')[1], dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}
