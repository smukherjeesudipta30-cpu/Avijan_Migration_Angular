import { Injectable, OnDestroy, effect, inject, signal } from '@angular/core';

import { CallKind } from '../models/chat.model';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';

/**
 * A gentle ring, not a full-volume alarm beep — standard low telephone-ring
 * frequencies (an incoming call's two-tone "ring-ring" is the classic
 * 350/440 Hz pair; an outgoing ringback is one softer tone) at a deliberately
 * modest gain, generated with the Web Audio API rather than shipping an audio
 * file. Runs as 1 second of tone every 3 seconds, not a continuous drone.
 */
class RingtonePlayer {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(outgoing: boolean): void {
    this.stop();

    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
    } catch {
      return;
    }

    const burst = () => {
      const ctx = this.ctx;
      if (!ctx) return;

      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      for (const freq of outgoing ? [425] : [350, 440]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 1);
      }
    };

    burst();
    this.timer = setInterval(burst, 3000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

/**
 * One-to-one audio/video calling over the chat connection's SignalR channel
 * as a pure signaling relay — the audio/video itself is peer-to-peer WebRTC,
 * never touching the server. Deliberately 1:1 only: a call among more than
 * two people needs real relay infrastructure (an SFU) this app doesn't have,
 * and STUN-only (no TURN), so a call can fail to connect on some restrictive
 * networks — accepted trade-offs for a first version, not oversights.
 *
 * Only one call at a time. Starting or accepting a second call while one is
 * already active isn't handled here — the UI is expected not to offer it.
 */
@Injectable({ providedIn: 'root' })
export class CallService implements OnDestroy {
  private readonly chat = inject(ChatService);
  private readonly auth = inject(AuthService);

  private readonly iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  /** No live SignalR connection reaches the other side at all — same rule the button ignores per the last complaint about it, but a call still has to give up eventually. */
  private static readonly RING_TIMEOUT_MS = 45_000;

  private peerConnection: RTCPeerConnection | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private currentCallId: string | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ringtone = new RingtonePlayer();

  /**
   * The outcome — missed or completed, with a duration — is only ever
   * logged into the chat by whichever side placed the call. Logging from
   * both sides would double every entry; the caller has the full lifecycle
   * (outgoing → connected-or-not → ended) either way, so it's the natural
   * single source of truth.
   */
  private isCaller = false;
  private conversationId: number | null = null;
  private connectedAt: number | null = null;
  private wasConnected = false;

  readonly status = signal<CallStatus>('idle');
  readonly kind = signal<CallKind>('audio');
  readonly peerEmail = signal<string | null>(null);
  readonly peerName = signal<string | null>(null);
  readonly localStream = signal<MediaStream | null>(null);
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly muted = signal(false);
  readonly cameraOff = signal(false);
  readonly errorMessage = signal<string | null>(null);

  /**
   * Android WebView defaults call audio to the earpiece. Actually switching
   * the physical route needs `setSinkId` on the element the remote audio
   * plays through — the component owns that element (see call-overlay's
   * hidden audio tag), so it registers it here via {@link registerAudioSink}
   * rather than this service reaching into the DOM itself. Best-effort: on a
   * browser/WebView build without output-device selection, the toggle still
   * flips visually but the OS keeps routing audio wherever it already was —
   * the same "don't let a missing platform capability break the call" stance
   * the rest of this service takes with mic/camera permission failures.
   */
  readonly speakerOn = signal(false);
  private audioSinkEl: HTMLMediaElement | null = null;

  /** Ticks once a second while a call is active; null the rest of the time. */
  readonly durationSeconds = signal(0);
  private durationTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      const status = this.status();
      if (status === 'incoming' || status === 'outgoing') {
        this.ringtone.start(status === 'outgoing');
      } else {
        this.ringtone.stop();
      }
    });

    this.chat.onIncomingCall.subscribe(call => {
      // Already on a call — the caller just hears it ring out and gives up,
      // the same as a phone that's already engaged. No "busy" signal wired
      // up yet; a small enough gap to leave for a later pass.
      if (this.status() !== 'idle') return;

      this.errorMessage.set(null);
      this.isCaller = false;
      this.conversationId = null;
      this.currentCallId = call.callId;
      this.peerEmail.set(call.fromEmail);
      this.peerName.set(call.fromName);
      this.kind.set(call.kind);
      this.status.set('incoming');
    });

    this.chat.onCallResponded.subscribe(response => {
      if (response.callId !== this.currentCallId) return;
      this.clearRingTimer();

      if (!response.accepted) {
        this.endLocally();
        return;
      }

      // We called and they accepted — as the caller, we make the offer.
      this.status.set('connecting');
      void this.createOfferAndSend();
    });

    this.chat.onCallSignal.subscribe(signal => {
      if (signal.callId !== this.currentCallId) return;
      void this.handleSignal(signal.type, signal.payload);
    });

    this.chat.onCallEnded.subscribe(ended => {
      if (ended.callId !== this.currentCallId) return;
      this.endLocally();
    });
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  /**
   * Starts a call. Offered for any Direct chat regardless of whether the
   * other person currently shows online — presence is a best-effort
   * courtesy dot, not a reliable "reachable right now" signal (someone can
   * be signed in on a device that isn't listening, or the dot itself can lag
   * a few seconds behind reality), and hiding the button on that alone made
   * calling look unavailable even when it would have worked fine. If nobody
   * answers, {@link RING_TIMEOUT_MS} gives up on its own.
   */
  async startCall(targetEmail: string, targetName: string, kind: CallKind, conversationId: number): Promise<void> {
    if (this.status() !== 'idle') return;

    this.errorMessage.set(null);
    this.isCaller = true;
    this.conversationId = conversationId;
    this.connectedAt = null;
    this.wasConnected = false;
    this.currentCallId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.peerEmail.set(targetEmail);
    this.peerName.set(targetName);
    this.kind.set(kind);

    this.ringTimer = setTimeout(() => {
      if (this.status() === 'outgoing') {
        this.errorMessage.set('No answer.');
        this.hangup();
      }
    }, CallService.RING_TIMEOUT_MS);
    this.status.set('outgoing');

    const me = this.auth.user();
    this.chat.callInvite(targetEmail, this.currentCallId, kind, me?.name ?? me?.email ?? 'Someone');
  }

  async acceptCall(): Promise<void> {
    const callId = this.currentCallId;
    const target = this.peerEmail();
    if (this.status() !== 'incoming' || !callId || !target) return;

    try {
      await this.ensureLocalMedia();
    } catch {
      this.errorMessage.set('Could not access the microphone/camera. Check the browser permission.');
      this.chat.callRespond(target, callId, false);
      this.endLocally();
      return;
    }

    this.status.set('connecting');
    this.chat.callRespond(target, callId, true);
    // The callee never initiates the offer — it waits for CallSignal 'offer'
    // from the caller, which arrives once the caller has made its own.
  }

  declineCall(): void {
    const callId = this.currentCallId;
    const target = this.peerEmail();
    if (this.status() !== 'incoming' || !callId || !target) return;

    this.chat.callRespond(target, callId, false);
    this.endLocally();
  }

  hangup(): void {
    const callId = this.currentCallId;
    const target = this.peerEmail();
    if (callId && target) this.chat.callHangup(target, callId);
    this.endLocally();
  }

  toggleMute(): void {
    const stream = this.localStream();
    if (!stream) return;
    const next = !this.muted();
    stream.getAudioTracks().forEach(track => (track.enabled = !next));
    this.muted.set(next);
  }

  toggleCamera(): void {
    const stream = this.localStream();
    if (!stream || this.kind() !== 'video') return;
    const next = !this.cameraOff();
    stream.getVideoTracks().forEach(track => (track.enabled = !next));
    this.cameraOff.set(next);
  }

  /** Called once by call-overlay with the element remote audio actually plays through. */
  registerAudioSink(el: HTMLMediaElement | null): void {
    this.audioSinkEl = el;
  }

  async toggleSpeaker(): Promise<void> {
    const next = !this.speakerOn();
    this.speakerOn.set(next);
    await this.applyAudioSink(next);
  }

  private async applyAudioSink(speaker: boolean): Promise<void> {
    const el = this.audioSinkEl as (HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el?.setSinkId || !navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      const match = outputs.find(d => speaker
        ? /speaker/i.test(d.label)
        : /earpiece|receiver|default/i.test(d.label));
      await el.setSinkId(match?.deviceId ?? '');
    } catch {
      // No output-device selection on this platform — the toggle state still
      // reflects the user's intent even though nothing could be applied.
    }
  }

  /* -------------------------------------------------------- WebRTC internals */

  private async ensureLocalMedia(): Promise<MediaStream> {
    const existing = this.localStream();
    if (existing) return existing;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.kind() === 'video'
    });

    this.localStream.set(stream);
    return stream;
  }

  private ensurePeerConnection(): RTCPeerConnection {
    if (this.peerConnection) return this.peerConnection;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    pc.onicecandidate = event => {
      const target = this.peerEmail();
      const callId = this.currentCallId;
      if (event.candidate && target && callId) {
        this.chat.callSignal(target, callId, 'ice', JSON.stringify(event.candidate));
      }
    };

    pc.ontrack = event => {
      this.remoteStream.set(event.streams[0] ?? null);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.status.set('active');
        if (!this.wasConnected) {
          this.wasConnected = true;
          this.connectedAt = Date.now();
          this.startDurationTimer();
          void this.applyAudioSink(this.speakerOn());
        }
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (this.status() !== 'idle') {
          this.errorMessage.set(
            pc.connectionState === 'failed' ? 'The call could not connect. Try again.' : null);
          this.endLocally();
        }
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  private async createOfferAndSend(): Promise<void> {
    const target = this.peerEmail();
    const callId = this.currentCallId;
    if (!target || !callId) return;

    try {
      const stream = await this.ensureLocalMedia();
      const pc = this.ensurePeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.chat.callSignal(target, callId, 'offer', JSON.stringify(offer));
    } catch {
      this.errorMessage.set('Could not access the microphone/camera. Check the browser permission.');
      this.hangup();
    }
  }

  private async handleSignal(type: 'offer' | 'answer' | 'ice', payload: string): Promise<void> {
    const target = this.peerEmail();
    const callId = this.currentCallId;
    if (!target || !callId) return;

    if (type === 'ice') {
      const candidate = JSON.parse(payload) as RTCIceCandidateInit;
      const pc = this.peerConnection;
      // The offer/answer may not have arrived yet — queue until it has, the
      // same "glare" ICE candidates need on either side of any WebRTC call.
      if (pc?.remoteDescription) {
        await pc.addIceCandidate(candidate).catch(() => {});
      } else {
        this.pendingIceCandidates.push(candidate);
      }
      return;
    }

    const pc = this.ensurePeerConnection();

    if (type === 'offer') {
      try {
        const stream = await this.ensureLocalMedia();
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(payload)));
        await this.flushPendingIce(pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.chat.callSignal(target, callId, 'answer', JSON.stringify(answer));
      } catch {
        this.errorMessage.set('Could not access the microphone/camera. Check the browser permission.');
        this.hangup();
      }
      return;
    }

    // type === 'answer'
    await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(payload)));
    await this.flushPendingIce(pc);
  }

  private async flushPendingIce(pc: RTCPeerConnection): Promise<void> {
    const queued = this.pendingIceCandidates;
    this.pendingIceCandidates = [];
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  private endLocally(): void {
    this.logCallOutcome();

    this.clearRingTimer();
    this.teardown();
    this.status.set('idle');
    this.currentCallId = null;
    this.peerEmail.set(null);
    this.peerName.set(null);
    this.muted.set(false);
    this.cameraOff.set(false);
    this.speakerOn.set(false);
    this.stopDurationTimer();
    this.isCaller = false;
    this.conversationId = null;
    this.connectedAt = null;
    this.wasConnected = false;

    // A message set right before ending (no answer, connection failed, mic
    // permission refused) needs a moment on screen — the overlay stays up
    // for it even at status 'idle' (see its own template) — rather than
    // vanishing the instant the call itself ends.
    if (this.errorMessage()) {
      setTimeout(() => this.errorMessage.set(null), 3500);
    }
  }

  /**
   * Drops one line into the chat so a missed call doesn't just vanish once
   * the ring stops — the same complaint any phone's call log solves. Posted
   * as an ordinary chat message through the same send path text uses, so it
   * persists, reaches the other side live, and triggers their push
   * notification for free; only the caller ever posts it (see the field
   * comment on isCaller) to avoid a duplicate from each side.
   */
  private logCallOutcome(): void {
    if (!this.isCaller || this.conversationId === null || !this.currentCallId) return;

    const label = this.kind() === 'video' ? 'Video call' : 'Voice call';

    const text = this.wasConnected
      ? `${label} · ${formatDuration(Date.now() - (this.connectedAt ?? Date.now()))}`
      : `Missed ${label.toLowerCase()}`;

    this.chat.send(this.conversationId, text).subscribe({
      error: () => { /* the call itself still ended cleanly either way */ }
    });
  }

  private clearRingTimer(): void {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    this.ringTimer = null;
  }

  private startDurationTimer(): void {
    this.stopDurationTimer();
    this.durationSeconds.set(0);
    this.durationTimer = setInterval(() => {
      this.durationSeconds.set(Math.max(0, Math.round((Date.now() - (this.connectedAt ?? Date.now())) / 1000)));
    }, 1000);
  }

  private stopDurationTimer(): void {
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.durationTimer = null;
    this.durationSeconds.set(0);
  }

  private teardown(): void {
    this.peerConnection?.close();
    this.peerConnection = null;
    this.pendingIceCandidates = [];

    this.localStream()?.getTracks().forEach(track => track.stop());
    this.localStream.set(null);
    this.remoteStream.set(null);
  }
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
