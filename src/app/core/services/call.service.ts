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

      // A browser (and far more aggressively an Android WebView) suspends the
      // AudioContext after the first tone or when focus is lost, which left the
      // ring falling silent after a second or two while the call was still
      // ringing. Re-resuming before every burst keeps it going; resume() on a
      // running context is a no-op.
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const gain = ctx.createGain();
      gain.gain.value = 0.09;
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

    this.ctx.resume().catch(() => {});
    burst();
    this.timer = setInterval(burst, 2000);
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

  /* STUN finds a direct path between the two devices; the TURN relay (set on
     the server, fetched at the start of each call) carries the audio when
     mobile data or a router will not keep a direct path open - without one
     a call connects and then goes silent after a few tens of seconds. */
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  /** Pending "the path dropped" check; an ICE restart is tried if it has not come back. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempts = 0;

  private async loadIceServers(): Promise<void> {
    try {
      const servers = await this.chat.iceServers();
      if (servers?.length) this.iceServers = servers;
    } catch {
      // Keep the STUN defaults; a direct path still works on most Wi-Fi.
    }
  }

  /** The Android app keeps its call alive with a foreground service; a browser has nothing to do. */
  private startKeepAlive(): void {}

  private stopKeepAlive(): void {}

  /**
   * The audio path dropped (network change, NAT timeout). Give it a few
   * seconds to recover on its own, then renegotiate with an ICE restart -
   * the caller makes the new offer - rather than sitting silently "in call".
   */
  private onPathLost(pc: RTCPeerConnection): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (pc !== this.peerConnection || pc.connectionState === 'connected') return;
      if (this.restartAttempts >= 3) {
        this.diagOutcome = 'lost-after-restarts';
        this.errorMessage.set('The call was lost. Please call again.');
        this.hangup();
        return;
      }
      this.restartAttempts++;
      this.diagRestarts++;
      if (this.isCaller) void this.createOfferAndSend(true);
      else pc.restartIce?.();
      this.onPathLost(pc);
    }, this.restartAttempts === 0 ? 4000 : 8000);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.restartAttempts = 0;
  }

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

  /* Call diagnostics: what this device saw of the network path, sent to the
     server log once when the call ends (see reportDiagnostics). host/srflx
     candidates are a direct path; relay is the TURN server. */
  private diagOutcome: string | null = null;
  private diagLocalTypes = new Set<string>();
  private diagRemoteTypes = new Set<string>();
  private diagSelectedPath: string | null = null;
  private diagRestarts = 0;

  readonly status = signal<CallStatus>('idle');
  readonly kind = signal<CallKind>('audio');
  readonly peerEmail = signal<string | null>(null);
  readonly peerName = signal<string | null>(null);
  readonly localStream = signal<MediaStream | null>(null);
  readonly remoteStream = signal<MediaStream | null>(null);
  readonly muted = signal(false);
  readonly cameraOff = signal(false);

  /** Emoji reactions floating over the call; each fades after a few seconds. */
  readonly reactions = signal<{ id: number; emoji: string; mine: boolean }[]>([]);
  readonly quickReactions = ['👍', '❤️', '😂', '😮', '👏', '🙏'];
  private reactionSeq = 0;

  /** The call filling the whole screen rather than a card. */
  readonly fullScreen = signal(false);

  /** Which camera a video call is using: the front one to start with. */
  readonly facing = signal<'user' | 'environment'>('user');
  readonly switchingCamera = signal(false);
  readonly errorMessage = signal<string | null>(null);

  /**
   * Which output the remote audio plays through, chosen with `setSinkId` on
   * the element playing it — the component owns that element (see
   * call-overlay's hidden audio tag) and registers it via
   * {@link registerAudioSink} rather than this service reaching into the DOM.
   *
   * Browser-only, and deliberately so: a machine running the website has no
   * earpiece, so this picks between real output devices (headset, speakers)
   * rather than routing a call the way a phone does. The Android app solves a
   * different problem — earpiece versus loudspeaker — which `setSinkId` cannot
   * express at all, so it drives AudioManager through a native plugin instead.
   *
   * Best-effort either way: where a browser offers no output-device selection
   * the toggle still reflects what was asked for rather than the call breaking
   * over a missing capability, the same stance taken with mic/camera failures.
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

      // Busy from the first ring, not just once answered. Presence's own
      // "away" timer fires immediately on visibilitychange with no grace
      // period, and a ringing call's tab going to the background used to
      // read as "away" for the whole ~45s it rang — exactly backwards:
      // ringing is the least "away" a person on the other end can be.
      // isInCall/"incall" already wins over "away" in presenceStatus(); this
      // just makes that true from the first ring instead of only pickup.
      this.chat.setCallStatus(true);
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
      if (signal.type === 'reaction') {
        this.showReaction(signal.payload, false);
        return;
      }
      void this.handleSignal(signal.type, signal.payload);
    });

    this.chat.onCallEnded.subscribe(ended => {
      if (ended.callId !== this.currentCallId) return;
      this.diagOutcome ??= 'other-side-hung-up';
      this.endLocally();
    });

    this.chat.onReconnected.subscribe(() => this.resendInviteIfRinging());
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
    void this.loadIceServers();

    // Busy from the first ring, not just once answered — see the matching
    // comment on the incoming side above.
    this.chat.setCallStatus(true);

    const me = this.auth.user();
    const callId = this.currentCallId;
    const delivered = await this.chat.callInvite(targetEmail, callId, kind, me?.name ?? me?.email ?? 'Someone');

    // On a slow or dropped connection the invite may never reach the server;
    // say so plainly instead of ringing out for 45 s to a phone that never rang.
    if (!delivered && this.currentCallId === callId && this.status() === 'outgoing') {
      // Not a missed call — the other phone never rang — so nothing is logged in the chat.
      this.isCaller = false;
      this.errorMessage.set('Could not place the call — your internet connection is too weak. Try again.');
      this.endLocally();
    }
  }

  /**
   * The connection came back while still ringing out: send the invite again,
   * in case the first one was lost with the connection. The callee ignores a
   * second invite while it is already ringing, so this can never ring twice.
   */
  private resendInviteIfRinging(): void {
    const callId = this.currentCallId, target = this.peerEmail();
    if (this.status() !== 'outgoing' || !this.isCaller || !callId || !target) return;
    const me = this.auth.user();
    void this.chat.callInvite(target, callId, this.kind(), me?.name ?? me?.email ?? 'Someone');
  }

  async acceptCall(): Promise<void> {
    const callId = this.currentCallId;
    const target = this.peerEmail();
    if (this.status() !== 'incoming' || !callId || !target) return;

    // Leave 'incoming' on the first tap, before anything slow (ICE servers,
    // the mic/camera permission). Until then the Accept button stayed on
    // screen looking ignored and people tapped it two or three times. Moving
    // off 'incoming' also stops the ring via the status effect.
    this.status.set('connecting');

    await this.loadIceServers();
    try {
      await this.ensureLocalMedia();
    } catch {
      if (this.currentCallId !== callId) return;
      this.errorMessage.set('Could not access the microphone/camera. Check the browser permission.');
      this.chat.callRespond(target, callId, false);
      this.endLocally();
      return;
    }

    // The caller hung up while the permission prompt was open: release the
    // mic/camera that was just opened instead of answering a dead call.
    if (this.currentCallId !== callId) {
      if (this.status() === 'idle') this.teardown();
      return;
    }

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
    this.diagOutcome ??= 'hung-up';
    this.endLocally();
  }

  toggleMute(): void {
    const stream = this.localStream();
    if (!stream) return;
    const next = !this.muted();
    stream.getAudioTracks().forEach(track => (track.enabled = !next));
    this.muted.set(next);
  }

  /**
   * Front <-> back camera mid-call. The old camera is released first, since
   * most phones cannot open both at once, and the new one replaces it on the
   * live connection — no renegotiation, the other side just sees the new view.
   * If the other camera will not open, the original one is put back.
   */
  async switchCamera(): Promise<void> {
    const stream = this.localStream();
    if (!stream || this.kind() !== 'video' || this.switchingCamera()) return;

    const from = this.facing();
    const to = from === 'user' ? 'environment' : 'user';
    this.switchingCamera.set(true);

    const open = async (facing: 'user' | 'environment') => {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 15 }, facingMode: { ideal: facing } }
      });
      const track = fresh.getVideoTracks()[0];
      track.enabled = !this.cameraOff();
      const sender = this.peerConnection?.getSenders().find(s => s.track?.kind === 'video');
      await sender?.replaceTrack(track);
      this.localStream.set(new MediaStream([...stream.getAudioTracks(), track]));
      this.facing.set(facing);
    };

    stream.getVideoTracks().forEach(t => t.stop());
    try {
      await open(to);
    } catch {
      this.errorMessage.set('Could not switch camera.');
      try { await open(from); } catch { /* left without video; the call itself carries on */ }
    } finally {
      this.switchingCamera.set(false);
    }
  }

  /** Sends an emoji to the other person; it floats up on both screens. */
  sendReaction(emoji: string): void {
    const target = this.peerEmail();
    const callId = this.currentCallId;
    if (!target || !callId || this.status() !== 'active') return;
    void this.chat.callSignal(target, callId, 'reaction', emoji);
    this.showReaction(emoji, true);
  }

  private showReaction(emoji: string, mine: boolean): void {
    // Only a short emoji is ever shown — the payload comes from the other side.
    const text = [...emoji].slice(0, 4).join('');
    if (!text.trim()) return;
    const id = ++this.reactionSeq;
    this.reactions.update(list => [...list.slice(-7), { id, emoji: text, mine }]);
    setTimeout(() => this.reactions.update(list => list.filter(r => r.id !== id)), 3200);
  }

  toggleFullScreen(): void {
    const next = !this.fullScreen();
    this.fullScreen.set(next);
    // In a browser also take the real screen; the app's WebView simply fills it.
    try {
      if (next && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
      if (!next && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    } catch { /* not supported: the full-screen layout alone still applies */ }
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

    // Sized for a phone on mobile data, not a studio: 640x360 at up to 15 fps is
    // clear enough for a face and far lighter than the 720p a camera offers by
    // default, which stalled or never connected on a weak connection. Voice
    // processing keeps audio intelligible at low bitrates.
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: this.kind() === 'video'
        ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 15 }, facingMode: this.facing() }
        : false
    });

    this.localStream.set(stream);
    return stream;
  }

  /**
   * Keeps outgoing video to about 350 kbps, so voice (which WebRTC always
   * favours) still gets through on a slow connection and the picture degrades
   * gracefully instead of freezing the call. No effect on an audio call.
   */
  private async capVideoBitrate(pc: RTCPeerConnection): Promise<void> {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      try {
        const params = sender.getParameters();
        params.encodings = params.encodings?.length ? params.encodings : [{}];
        params.encodings[0].maxBitrate = 350_000;
        params.encodings[0].maxFramerate = 15;
        await sender.setParameters(params);
      } catch {
        // Not every browser allows this before negotiation; the camera
        // constraints above already keep the stream small.
      }
    }
  }

  private ensurePeerConnection(): RTCPeerConnection {
    if (this.peerConnection) return this.peerConnection;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });

    pc.onicecandidate = event => {
      const target = this.peerEmail();
      const callId = this.currentCallId;
      if (event.candidate?.type) this.diagLocalTypes.add(event.candidate.type);
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
          void this.recordSelectedPath(pc);
          this.startKeepAlive();
          this.connectedAt = Date.now();
          this.startDurationTimer();
          void this.applyAudioSink(this.speakerOn());
          // Let everyone's presence show this person as busy for the call's life.
          this.chat.setCallStatus(true);
        }
      }
      if (pc.connectionState === 'connected') this.clearReconnect();
      // Dropped mid-call: try to get it back instead of going silent.
      if (this.wasConnected && (pc.connectionState === 'disconnected' || pc.connectionState === 'failed')) {
        this.onPathLost(pc);
        return;
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (this.status() !== 'idle') {
          this.diagOutcome ??= pc.connectionState === 'failed' ? 'failed-before-connect' : 'closed';
          this.errorMessage.set(
            pc.connectionState === 'failed' ? 'The call could not connect. Try again.' : null);
          this.endLocally();
        }
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  private async createOfferAndSend(iceRestart = false): Promise<void> {
    const target = this.peerEmail();
    const callId = this.currentCallId;
    if (!target || !callId) return;

    try {
      const stream = await this.ensureLocalMedia();
      const pc = this.ensurePeerConnection();
      if (pc.getSenders().length === 0) {
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        void this.capVideoBitrate(pc);
      }

      const offer = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
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
      const remoteType = / typ (\w+)/.exec(candidate.candidate ?? '')?.[1];
      if (remoteType) this.diagRemoteTypes.add(remoteType);
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
        if (pc.getSenders().length === 0) {
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          void this.capVideoBitrate(pc);
        }

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
    this.reactions.set([]);
    if (this.fullScreen()) this.toggleFullScreen();
    this.logCallOutcome();
    this.reportDiagnostics();

    // Clear the busy state whether or not the call ever connected, so a missed
    // or declined call never leaves someone stuck showing as "in call".
    this.chat.setCallStatus(false);

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

  /** Which candidate pair actually carried the call, e.g. "relay>srflx/udp". */
  private async recordSelectedPath(pc: RTCPeerConnection): Promise<void> {
    try {
      const stats = await pc.getStats();
      let pair: any = null;
      stats.forEach((s: any) => {
        if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId);
      });
      if (!pair) stats.forEach((s: any) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
      if (!pair) return;
      const local: any = stats.get(pair.localCandidateId);
      const remote: any = stats.get(pair.remoteCandidateId);
      this.diagSelectedPath = `${local?.candidateType ?? '?'}>${remote?.candidateType ?? '?'}/${local?.protocol ?? '?'}`;
    } catch {
      // Diagnostics only.
    }
  }

  /**
   * One line in the server log per call that got as far as setting up a
   * connection (a missed or declined call has no network path to report).
   */
  private reportDiagnostics(): void {
    const pc = this.peerConnection;
    if (pc && this.currentCallId) {
      const conn = (navigator as any).connection;
      this.chat.callDiagnostics({
        callId: this.currentCallId,
        role: this.isCaller ? 'caller' : 'callee',
        kind: this.kind(),
        outcome: this.diagOutcome ?? 'ended',
        wasConnected: this.wasConnected,
        durationSeconds: this.connectedAt ? Math.round((Date.now() - this.connectedAt) / 1000) : 0,
        connectionState: pc.connectionState,
        iceState: pc.iceConnectionState,
        turnConfigured: this.iceServers.some(s => [s.urls].flat().some(u => String(u).startsWith('turn'))),
        localCandidates: [...this.diagLocalTypes].join(',') || 'none',
        remoteCandidates: [...this.diagRemoteTypes].join(',') || 'none',
        selectedPath: this.diagSelectedPath ?? 'none',
        restarts: this.diagRestarts,
        network: conn ? `${conn.type ?? ''} ${conn.effectiveType ?? ''}`.trim() : null,
        device: navigator.userAgent
      });
    }
    this.diagOutcome = null;
    this.diagLocalTypes = new Set();
    this.diagRemoteTypes = new Set();
    this.diagSelectedPath = null;
    this.diagRestarts = 0;
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
    this.facing.set('user');
    this.clearReconnect();
    this.stopKeepAlive();
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
