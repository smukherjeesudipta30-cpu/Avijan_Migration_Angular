import { Component, ElementRef, OnDestroy, input, model, signal, viewChild } from '@angular/core';

/**
 * A photo taken with the camera or picked from the gallery, cropped to a fixed
 * shape and shrunk to a small JPEG in the browser, so only a few dozen KB go to
 * the server. The value is a data URL ("data:image/jpeg;base64,…"), or null.
 *
 * The camera opens a live view (getUserMedia) where the browser allows one —
 * a laptop's webcam, or a phone over HTTPS. Where it does not, the phone's own
 * camera app is opened instead through a file input with `capture`.
 */
@Component({
  selector: 'app-photo-capture',
  standalone: true,
  template: `
    <div class="pc" [style.--pc-ratio]="aspect()">
      <div class="pc__frame" [style.width]="frameWidth()">
        @if (value(); as src) {
          <img [src]="src" [alt]="label()" />
        } @else {
          <span class="pc__empty"><i class="pi pi-user" aria-hidden="true"></i>{{ label() }}</span>
        }
      </div>
      <div class="pc__actions">
        <button type="button" class="pc__btn" (click)="openCamera()"><i class="pi pi-camera" aria-hidden="true"></i> Camera</button>
        <button type="button" class="pc__btn" (click)="gallery.click()"><i class="pi pi-images" aria-hidden="true"></i> Gallery</button>
        @if (value()) {
          <button type="button" class="pc__btn pc__btn--quiet" (click)="value.set(null)" [attr.aria-label]="'Remove ' + label()"><i class="pi pi-trash" aria-hidden="true"></i></button>
        }
      </div>
      <input #gallery type="file" accept="image/*" hidden (change)="picked($event)" />
      <input #phoneCamera type="file" accept="image/*" capture="environment" hidden (change)="picked($event)" />
      @if (error()) { <small class="pc__error">{{ error() }}</small> }
    </div>

    @if (live()) {
      <div class="pc-cam" role="dialog" aria-modal="true" [attr.aria-label]="'Take a photo: ' + label()">
        <div class="pc-cam__box">
          <div class="pc-cam__view" [style.--pc-ratio]="aspect()">
            <video #video autoplay playsinline muted></video>
          </div>
          <div class="pc-cam__bar">
            <button type="button" class="pc__btn" (click)="closeCamera()">Cancel</button>
            <button type="button" class="pc-cam__shoot" (click)="shoot()" aria-label="Take photo"></button>
            <button type="button" class="pc__btn" (click)="flip()"><i class="pi pi-sync" aria-hidden="true"></i> Flip</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .pc { display: flex; flex-direction: column; gap: 0.45rem; align-items: flex-start; }
    .pc__frame { width: 7.5rem; aspect-ratio: var(--pc-ratio); border-radius: 12px; overflow: hidden; background: #f5f3ff;
      border: 2px dashed #d6ccf5; display: grid; place-items: center; }
    .pc__frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .pc__empty { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; padding: 0.4rem; text-align: center;
      font-size: 0.72rem; color: #6d5aa8; }
    .pc__empty i { font-size: 1.6rem; }
    .pc__actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .pc__btn { display: inline-flex; gap: 0.3rem; align-items: center; padding: 0.35rem 0.65rem; border: 1px solid #d6ccf5;
      border-radius: 999px; background: #fff; color: #4c1d95; font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
    .pc__btn--quiet { color: #b42318; border-color: #f2c4c4; }
    .pc__error { color: #b42318; font-size: 0.75rem; max-width: 14rem; }
    .pc-cam { position: fixed; inset: 0; z-index: 2000; background: rgba(10, 8, 25, 0.85); display: grid; place-items: center; padding: 1rem; }
    .pc-cam__box { width: min(26rem, 100%); display: flex; flex-direction: column; gap: 0.9rem; }
    .pc-cam__view { width: 100%; aspect-ratio: var(--pc-ratio); border-radius: 16px; overflow: hidden; background: #000; }
    .pc-cam__view video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .pc-cam__bar { display: flex; justify-content: space-between; align-items: center; }
    .pc-cam__shoot { width: 4rem; height: 4rem; border-radius: 50%; border: 5px solid #fff; background: #ff6b8b; cursor: pointer; }
  `]
})
export class PhotoCaptureComponent implements OnDestroy {
  /** What the photo is of, e.g. "Child" or "Guardian 1". */
  readonly label = input('Photo');
  /** Width / height. 0.8 is a passport-style 4:5; the picture is cropped to it. */
  readonly aspect = input(0.8);
  /** The longer side of the saved picture, in pixels. */
  readonly size = input(600);
  /** How wide the preview is on the page. */
  readonly frameWidth = input('7.5rem');
  readonly value = model<string | null>(null);

  readonly live = signal(false);
  readonly error = signal('');

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly phoneCamera = viewChild.required<ElementRef<HTMLInputElement>>('phoneCamera');
  private stream: MediaStream | null = null;
  private facing: 'user' | 'environment' = 'environment';

  async openCamera(): Promise<void> {
    this.error.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.phoneCamera().nativeElement.click();
      return;
    }
    try {
      await this.start();
    } catch {
      // No camera, permission refused, or a page not served over HTTPS: the
      // phone's camera app can still take one.
      this.closeCamera();
      this.phoneCamera().nativeElement.click();
    }
  }

  async flip(): Promise<void> {
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    try { await this.start(); } catch { this.error.set('Could not switch camera.'); }
  }

  shoot(): void {
    const v = this.video()?.nativeElement;
    if (!v || !v.videoWidth) return;
    this.value.set(this.crop(v, v.videoWidth, v.videoHeight));
    this.closeCamera();
  }

  closeCamera(): void {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.live.set(false);
  }

  picked(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.error.set('Choose a picture.');
      return;
    }
    this.error.set('');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      this.value.set(this.crop(img, img.naturalWidth, img.naturalHeight));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      this.error.set('That picture could not be opened. Try another one.');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  ngOnDestroy(): void { this.closeCamera(); }

  private async start(): Promise<void> {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: this.facing, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false
    });
    this.live.set(true);
    // The video element appears once the dialog has rendered.
    await new Promise(r => setTimeout(r));
    const v = this.video()?.nativeElement;
    if (v) v.srcObject = this.stream;
  }

  /** The centre of the picture cut to the chosen shape, as a small JPEG. */
  private crop(source: CanvasImageSource, w: number, h: number): string {
    const ratio = this.aspect();
    let sw = w, sh = w / ratio;
    if (sh > h) { sh = h; sw = h * ratio; }
    const sx = (w - sw) / 2, sy = (h - sh) / 2;

    const longest = this.size();
    const outW = ratio >= 1 ? longest : Math.round(longest * ratio);
    const outH = ratio >= 1 ? Math.round(longest / ratio) : longest;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
}
