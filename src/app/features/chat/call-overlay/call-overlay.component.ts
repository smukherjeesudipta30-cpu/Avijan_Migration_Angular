import { CommonModule } from '@angular/common';
import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';

import { CallService } from '../../../core/services/call.service';

/**
 * Mounted once alongside the chat panel (see shell.component.html), the same
 * way — so a call can ring in and be answered from anywhere in the app, not
 * only while the chat drawer happens to be open.
 */
@Component({
  selector: 'app-call-overlay',
  imports: [CommonModule, ButtonModule],
  templateUrl: './call-overlay.component.html',
  styleUrl: './call-overlay.component.scss'
})
export class CallOverlayComponent {
  readonly call = inject(CallService);

  readonly localVideo = viewChild<ElementRef<HTMLVideoElement>>('localVideo');
  readonly remoteVideo = viewChild<ElementRef<HTMLVideoElement>>('remoteVideo');

  constructor() {
    effect(() => {
      const el = this.localVideo()?.nativeElement;
      if (el) el.srcObject = this.call.localStream();
    });

    effect(() => {
      const el = this.remoteVideo()?.nativeElement;
      if (el) el.srcObject = this.call.remoteStream();

      // Whichever element remote audio actually plays through (the visible
      // video tag, or the hidden one used for audio-only calls) is also the
      // one setSinkId has to target for the speaker/earpiece toggle.
      this.call.registerAudioSink(el ?? null);
    });
  }

  initials(name: string | null): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return '?';
    const parts = trimmed.split(/\s+/);
    return parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}
