import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, OnDestroy, effect, inject, input, signal, viewChild } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { environment } from '../../../environments/environment';

/** Longest side of the saved photo; plenty for the birthday card's circle. */
const MAX_SIDE = 640;

/**
 * A staff member's photograph on the User form: taken with the camera (the phone
 * camera, or the computer's webcam) or chosen from a file. Printed on their
 * birthday wish card.
 */
@Component({
  selector: 'app-user-photo',
  standalone: true,
  imports: [ButtonModule, DialogModule],
  template: `
    <div class="uph">
      <div class="uph__frame">
        @if (url(); as u) { <img [src]="u" alt="Photo" /> } @else { <i class="pi pi-user"></i> }
      </div>
      <div class="uph__actions">
        <strong>Photo</strong>
        <small class="app-muted">Shown on their birthday wish card.</small>
        <div class="uph__buttons">
          <p-button label="Take photo" icon="pi pi-camera" size="small" (onClick)="takePhoto()" [loading]="saving()" />
          <p-button label="Upload" icon="pi pi-upload" size="small" severity="secondary" (onClick)="fileInput.click()" />
          @if (url()) {
            <p-button label="Remove" icon="pi pi-trash" size="small" severity="danger" [text]="true" (onClick)="remove()" />
          }
        </div>
      </div>
      <input #cameraInput type="file" accept="image/*" capture="user" hidden (change)="picked($event)" />
      <input #fileInput type="file" accept="image/png,image/jpeg" hidden (change)="picked($event)" />
    </div>

    <p-dialog [visible]="webcamOpen()" (visibleChange)="!$event && closeWebcam()" [modal]="true" header="Take photo"
              [style]="{ width: 'min(28rem, 96vw)' }">
      <video #video class="uph__video" autoplay playsinline muted></video>
      <div class="uph__buttons uph__buttons--end">
        <p-button label="Cancel" severity="secondary" (onClick)="closeWebcam()" />
        <p-button label="Capture" icon="pi pi-camera" (onClick)="capture()" />
      </div>
    </p-dialog>
  `,
  styles: [`
    .uph { display: flex; gap: 1rem; align-items: center; margin: .5rem 0 1rem; }
    .uph__frame { width: 96px; height: 96px; border-radius: 50%; overflow: hidden; background: #eef0f6;
      display: grid; place-items: center; flex: 0 0 auto; border: 3px solid #f6d365; }
    .uph__frame img { width: 100%; height: 100%; object-fit: cover; }
    .uph__frame .pi { font-size: 2.4rem; color: #9aa3b8; }
    .uph__actions { display: flex; flex-direction: column; gap: .25rem; }
    .uph__buttons { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .3rem; }
    .uph__buttons--end { justify-content: flex-end; margin-top: .8rem; }
    .uph__video { width: 100%; border-radius: 10px; background: #000; transform: scaleX(-1); }
  `]
})
export class UserPhotoComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  private readonly cameraInput = viewChild.required<ElementRef<HTMLInputElement>>('cameraInput');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly userId = input.required<number>();
  readonly url = signal<string | null>(null);
  readonly saving = signal(false);
  readonly webcamOpen = signal(false);
  private stream: MediaStream | null = null;

  constructor() {
    effect(() => this.load(this.userId()));
  }

  ngOnDestroy(): void {
    this.setUrl(null);
    this.stopStream();
  }

  /** Phone: the camera app via the file input. Computer: the webcam, in a dialog. */
  async takePhoto(): Promise<void> {
    const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (phone || !navigator.mediaDevices?.getUserMedia) {
      this.cameraInput().nativeElement.click();
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      this.webcamOpen.set(true);
      setTimeout(() => {
        const v = this.video()?.nativeElement;
        if (v && this.stream) v.srcObject = this.stream;
      });
    } catch {
      this.messages.add({ severity: 'warn', summary: 'Camera not available',
        detail: 'Allow the camera for this site, or use Upload.', life: 5000 });
    }
  }

  capture(): void {
    const v = this.video()?.nativeElement;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    this.closeWebcam();
    canvas.toBlob(b => b && this.save(b), 'image/jpeg', 0.9);
  }

  closeWebcam(): void {
    this.stopStream();
    this.webcamOpen.set(false);
  }

  picked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.save(file);
  }

  remove(): void {
    this.http.delete(`${this.base()}`).subscribe({
      next: () => { this.setUrl(null); this.messages.add({ severity: 'success', summary: 'Photo removed', life: 3000 }); }
    });
  }

  private async save(file: Blob): Promise<void> {
    this.saving.set(true);
    try {
      const jpeg = await shrink(file);
      const base64 = await toBase64(jpeg);
      this.http.put(this.base(), { contentType: 'image/jpeg', base64 }).subscribe({
        next: () => {
          this.setUrl(URL.createObjectURL(jpeg));
          this.saving.set(false);
          this.messages.add({ severity: 'success', summary: 'Photo saved', life: 3000 });
        },
        error: () => this.saving.set(false)
      });
    } catch {
      this.saving.set(false);
      this.messages.add({ severity: 'error', summary: 'That picture could not be read', life: 4000 });
    }
  }

  private load(id: number): void {
    this.setUrl(null);
    this.http.get(this.base(id), { responseType: 'blob' }).subscribe({
      next: blob => { if (blob.size) this.setUrl(URL.createObjectURL(blob)); },
      error: () => { /* no photo yet */ }
    });
  }

  private base(id = this.userId()): string {
    return `${environment.apiBaseUrl}/users/${id}/photo`;
  }

  private setUrl(url: string | null): void {
    const old = this.url();
    if (old) URL.revokeObjectURL(old);
    this.url.set(url);
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }
}

/** Scales the picture down to MAX_SIDE and re-encodes it as JPEG. */
async function shrink(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.88));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
