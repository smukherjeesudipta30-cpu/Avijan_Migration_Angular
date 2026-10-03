import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Observable, Subject, firstValueFrom, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  CallEnded,
  CallResponded,
  CallSignal,
  ChatAttachmentUpload,
  ChatConversationSummary,
  ChatDirectoryEntry,
  ChatMessage,
  ChatMessagesRead,
  ChatMessagesRemoved,
  ChatPresenceSnapshot,
  ChatTypingChanged,
  GuestStarted,
  IncomingCall
} from '../models/chat.model';
import { AuthService } from './auth.service';

/**
 * Chat: REST for every read and write (so ordinary request/response handles
 * validation, authorization and errors the same way as the rest of the app),
 * and one shared SignalR connection purely to be told "something changed" —
 * the actual data still comes from the REST calls above, the socket just says
 * when to make one again. Works both signed in (the internal chat panel) and
 * anonymous (the public guest widget): `connect()` passes whatever access
 * token is on hand, which is nothing at all for a visitor who has never
 * signed in.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/chat`;

  private connection: signalR.HubConnection | null = null;
  private connecting: Promise<void> | null = null;

  private readonly messageReceived$ = new Subject<ChatMessage>();
  private readonly conversationsChanged$ = new Subject<void>();
  private readonly guestInboxChanged$ = new Subject<void>();
  private readonly messagesRead$ = new Subject<ChatMessagesRead>();
  private readonly incomingCall$ = new Subject<IncomingCall>();
  private readonly callResponded$ = new Subject<CallResponded>();
  private readonly callSignal$ = new Subject<CallSignal>();
  private readonly callEnded$ = new Subject<CallEnded>();

  readonly onMessage: Observable<ChatMessage> = this.messageReceived$.asObservable();
  readonly onConversationsChanged: Observable<void> = this.conversationsChanged$.asObservable();
  readonly onGuestInboxChanged: Observable<void> = this.guestInboxChanged$.asObservable();
  readonly onMessagesRead: Observable<ChatMessagesRead> = this.messagesRead$.asObservable();

  private readonly messagesDeleted$ = new Subject<ChatMessagesRemoved>();
  private readonly messagesHidden$ = new Subject<ChatMessagesRemoved>();
  private readonly typingChanged$ = new Subject<ChatTypingChanged>();
  private readonly reconnected$ = new Subject<void>();

  /** Deleted for everyone — swap each for a "This message was deleted" placeholder. */
  readonly onMessagesDeleted: Observable<ChatMessagesRemoved> = this.messagesDeleted$.asObservable();

  /** Hidden by this same user from another tab or device — drop them from view. */
  readonly onMessagesHidden: Observable<ChatMessagesRemoved> = this.messagesHidden$.asObservable();

  /** Someone else in a conversation started or stopped typing. */
  readonly onTypingChanged: Observable<ChatTypingChanged> = this.typingChanged$.asObservable();

  /**
   * The socket came back after a drop. Anything pushed while it was down
   * (a message, a deletion) was missed, and SignalR group memberships joined
   * by hand were lost — listeners reload what they show and rejoin.
   */
  readonly onReconnected: Observable<void> = this.reconnected$.asObservable();

  /* ------------------------------------------------------------- calls */
  /** WebRTC signaling relay only — see CallService for the actual peer connection. */
  readonly onIncomingCall: Observable<IncomingCall> = this.incomingCall$.asObservable();
  readonly onCallResponded: Observable<CallResponded> = this.callResponded$.asObservable();
  readonly onCallSignal: Observable<CallSignal> = this.callSignal$.asObservable();
  readonly onCallEnded: Observable<CallEnded> = this.callEnded$.asObservable();

  /**
   * Who currently has the app open — a courtesy dot, not a guarantee (someone
   * can go offline the instant after this is read). Kept as a signal here
   * rather than an event stream: every consumer just wants "the current set",
   * not to replay the history of who came and went.
   */
  readonly onlineEmails = signal<ReadonlySet<string>>(new Set());

  /** Always a subset of {@link onlineEmails} — connected, but idle or on a hidden tab. */
  readonly awayEmails = signal<ReadonlySet<string>>(new Set());

  /** Always a subset of {@link onlineEmails} — currently on a call, so worth not interrupting. */
  readonly inCallEmails = signal<ReadonlySet<string>>(new Set());

  /** Email → when that person was last seen (ISO string), for offline contacts. */
  readonly lastSeenByEmail = signal<ReadonlyMap<string, string>>(new Map());

  /** How long with no activity, or with the tab hidden, before this browser reports itself away. */
  private static readonly AWAY_AFTER_MS = 2 * 60 * 1000;

  private awayTimer: ReturnType<typeof setTimeout> | null = null;
  private localAway = false;
  /** This device is ringing or on a call: never reported away meanwhile. */
  private localInCall = false;
  private activityCleanup: (() => void) | null = null;

  /**
   * Waits between attempts to bring a dropped connection back — never gives
   * up, settles at 30 s. Tight at first, so a short blip recovers in seconds:
   * someone pressing Call during one is waiting on exactly this.
   */
  private static readonly RETRY_DELAYS_MS = [0, 1000, 2000, 3000, 5000, 10000, 20000, 30000];

  /** Set by {@link disconnect} (sign-out): the only time the connection is meant to stay down. */
  private stopped = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempt = 0;
  private everStarted = false;
  private wakeListenersAdded = false;

  /**
   * Opens the real-time connection and keeps it open for as long as the person
   * is signed in. Safe to call repeatedly. Every read and write still works
   * over REST without it, but presence ("online") and incoming calls do not —
   * a person whose connection is down shows offline and is never rung.
   *
   * Two gaps used to leave a signed-in person silently offline until they
   * reloaded: SignalR's own reconnect gives up after 4 tries (about 42
   * seconds), so a phone asleep in a pocket, a patch of bad signal or a server
   * restart ended the connection for good; and it never retries a FIRST start
   * that failed at all. Both are closed here: the retry schedule never ends,
   * a failed or closed connection is restarted on the same schedule, and coming
   * back online or back to the screen reconnects at once.
   */
  connect(): Promise<void> {
    this.stopped = false;
    this.addWakeListeners();

    if (this.connection) {
      this.reconnectNow();
      return this.connecting ?? Promise.resolve();
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.hubBaseUrl}/chat`, {
        accessTokenFactory: () => this.auth.accessToken ?? ''
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: ctx =>
          ChatService.RETRY_DELAYS_MS[Math.min(ctx.previousRetryCount, ChatService.RETRY_DELAYS_MS.length - 1)]
      })
      .build();

    connection.on('MessageReceived', (message: ChatMessage) => {
      // The server computes `isMine` once, from the SENDER's point of view,
      // and pushes that same object to every listener in the conversation —
      // so taken at face value, it reads "mine" for every recipient too, not
      // just the sender. Recomputed here against whoever is actually looking
      // at this browser: a signed-in viewer by email; the guest widget (no
      // sign-in at all) by "the message has no sender email", since a null
      // SenderEmail is exactly how the guest's own messages are marked.
      const myEmail = this.auth.user()?.email;
      const isMine = myEmail ? message.senderEmail === myEmail : message.senderEmail == null;

      this.messageReceived$.next({ ...message, isMine });
    });
    connection.on('ConversationsChanged', () => this.conversationsChanged$.next());
    connection.on('GuestInboxChanged', () => this.guestInboxChanged$.next());

    connection.on('MessagesRead', (conversationId: number, readerEmail: string, lastReadMessageId: number) => {
      this.messagesRead$.next({ conversationId, readerEmail, lastReadMessageId });
    });

    connection.on('IncomingCall', (fromEmail: string, fromName: string, callId: string, kind: 'audio' | 'video') => {
      this.incomingCall$.next({ fromEmail, fromName, callId, kind });
    });

    connection.on('CallResponded', (fromEmail: string, callId: string, accepted: boolean) => {
      this.callResponded$.next({ fromEmail, callId, accepted });
    });

    connection.on('CallSignal', (fromEmail: string, callId: string, type: 'offer' | 'answer' | 'ice' | 'reaction', payload: string) => {
      this.callSignal$.next({ fromEmail, callId, type, payload });
    });

    connection.on('CallEnded', (fromEmail: string, callId: string) => {
      this.callEnded$.next({ fromEmail, callId });
    });

    // 'online' | 'away' | 'incall' | 'offline'. Away and incall are courtesy
    // states on top of online; offline drops the connection entirely.
    connection.on('PresenceChanged', (rawEmail: string, status: 'online' | 'away' | 'incall' | 'offline', lastSeenOn?: string | null) => {
      // Matched without regard to case: a few accounts' addresses are stored
      // with capitals, and the server keys presence in lower case.
      const email = norm(rawEmail);
      this.onlineEmails.update(current => {
        const next = new Set(current);
        if (status === 'offline') next.delete(email); else next.add(email);
        return next;
      });

      this.awayEmails.update(current => {
        const next = new Set(current);
        if (status === 'away') next.add(email); else next.delete(email);
        return next;
      });

      this.inCallEmails.update(current => {
        const next = new Set(current);
        if (status === 'incall') next.add(email); else next.delete(email);
        return next;
      });

      if (status === 'offline' && lastSeenOn) {
        this.lastSeenByEmail.update(current => {
          const next = new Map(current);
          next.set(email, lastSeenOn);
          return next;
        });
      }
    });

    connection.on('TypingChanged', (conversationId: number, email: string | null, name: string, isTyping: boolean) => {
      this.typingChanged$.next({ conversationId, email, name, isTyping });
    });

    connection.on('MessagesDeleted', (conversationId: number, messageIds: number[]) => {
      this.messagesDeleted$.next({ conversationId, messageIds });
    });

    connection.on('MessagesHidden', (conversationId: number, messageIds: number[]) => {
      this.messagesHidden$.next({ conversationId, messageIds });
    });

    // A fresh connection has missed whatever presence changes happened before
    // it existed, so it needs a snapshot rather than only future deltas. The
    // guest widget has no token and no use for this — skipped for it.
    connection.onreconnected(() => {
      if (this.auth.accessToken) {
        this.loadPresenceSnapshot();
        // The server treats a new connection as active; if this tab is in fact
        // hidden or idle, say so again or it would read "online" to everyone.
        if (this.localAway) connection.invoke('SetPresenceStatus', true).catch(() => {});
      }
      this.reconnected$.next();
    });

    // Closed for good (a start that failed outright, or anything the retry
    // schedule above could not recover): start again rather than stay offline.
    connection.onclose(() => this.scheduleRestart());

    this.connection = connection;
    this.connecting = this.startNow();
    return this.connecting;
  }

  /** Starts the connection if it is down; on failure, tries again on the retry schedule. */
  private startNow(): Promise<void> {
    const connection = this.connection;
    if (!connection || this.stopped || connection.state !== signalR.HubConnectionState.Disconnected) {
      return Promise.resolve();
    }

    return connection
      .start()
      .then(() => {
        this.restartAttempt = 0;
        const firstTime = !this.everStarted;
        this.everStarted = true;

        if (this.auth.accessToken) {
          this.loadPresenceSnapshot();
          this.setupActivityTracking(connection);
          if (firstTime) void this.enablePushNotifications();
        }
        // A brand-new connection has no conversation groups joined by hand and
        // has missed anything sent meanwhile — listeners reload, as after a reconnect.
        if (!firstTime) this.reconnected$.next();
      })
      .catch(() => this.scheduleRestart())
      .finally(() => {
        this.connecting = null;
      });
  }

  private scheduleRestart(): void {
    if (this.stopped || !this.connection || this.restartTimer) return;

    const delays = ChatService.RETRY_DELAYS_MS;
    const delay = Math.max(1000, delays[Math.min(this.restartAttempt, delays.length - 1)]);
    this.restartAttempt++;

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.connecting = this.startNow();
    }, delay);
  }

  /** Back online, or back to the screen: reconnect straight away instead of waiting out the schedule. */
  private reconnectNow(): void {
    if (this.stopped || !this.connection || this.connection.state !== signalR.HubConnectionState.Disconnected) return;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.restartAttempt = 0;
    this.connecting = this.startNow();
  }

  private addWakeListeners(): void {
    if (this.wakeListenersAdded) return;
    this.wakeListenersAdded = true;
    window.addEventListener('online', () => this.reconnectNow());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.reconnectNow();
    });
  }

  /**
   * Reports this browser's own away/active state so everyone else's presence
   * dot can tell "connected and actually looking at it" apart from "connected,
   * but the tab's been sitting untouched for a while" — the same distinction
   * a phone's messaging app makes with "online" vs "last seen a bit ago".
   * Guest widget never calls this: it has no identity for the hub to attach
   * the status to.
   */
  private setupActivityTracking(connection: signalR.HubConnection): void {
    this.activityCleanup?.();
    this.localAway = false;

    const reportLocal = (away: boolean): void => {
      // On a call (or ringing) the screen going off, or another app coming to
      // the front, is not "away" - the person is talking. Stay present.
      if (away && this.localInCall) away = false;
      if (this.localAway === away) return;
      this.localAway = away;
      connection.invoke('SetPresenceStatus', away).catch(() => {
        // Presence is a courtesy; a missed update corrects itself on the
        // next activity or the next reconnect's snapshot.
      });
    };

    const resetAwayTimer = (): void => {
      if (this.awayTimer) clearTimeout(this.awayTimer);
      this.awayTimer = setTimeout(() => reportLocal(true), ChatService.AWAY_AFTER_MS);
    };

    const onActivity = (): void => {
      reportLocal(false);
      resetAwayTimer();
    };

    const onVisibilityChange = (): void => {
      if (document.hidden) {
        if (this.awayTimer) clearTimeout(this.awayTimer);
        reportLocal(true);
      } else {
        onActivity();
      }
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;
    for (const event of activityEvents) document.addEventListener(event, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (document.hidden) reportLocal(true); else resetAwayTimer();

    this.activityCleanup = () => {
      for (const event of activityEvents) document.removeEventListener(event, onActivity);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (this.awayTimer) clearTimeout(this.awayTimer);
      this.awayTimer = null;
    };
  }

  /**
   * Registers the service worker and subscribes it for push, so a chat
   * message can reach this browser as a native notification even with the
   * site closed entirely — not just backgrounded. Safe to call every time a
   * connection opens: an already-decided permission (granted or denied)
   * resolves immediately with no prompt shown again, and re-subscribing an
   * already-subscribed browser is a harmless no-op on the server.
   */
  private async enablePushNotifications(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const keyResponse = await firstValueFrom(
        this.http.get<ApiResponse<string>>(`${this.base}/push/public-key`));

      const publicKey = keyResponse?.data;
      if (!publicKey) return;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.['p256dh'] || !json.keys?.['auth']) return;

      this.http
        .post<ApiResponse<boolean>>(`${this.base}/push/subscribe`, {
          endpoint: json.endpoint,
          p256dh: json.keys['p256dh'],
          auth: json.keys['auth']
        })
        .subscribe({ error: () => { /* best-effort — corrects itself next connect */ } });
    } catch {
      // No push this session; SignalR and REST keep working regardless.
    }
  }

  private loadPresenceSnapshot(): void {
    this.http
      .get<ApiResponse<ChatPresenceSnapshot>>(`${this.base}/presence`)
      .subscribe({
        next: response => {
          this.onlineEmails.set(new Set(response.data.onlineEmails.map(norm)));
          this.awayEmails.set(new Set(response.data.awayEmails.map(norm)));
          this.inCallEmails.set(new Set((response.data.inCallEmails ?? []).map(norm)));
        },
        error: () => { /* presence is a courtesy; nothing to recover here */ }
      });
  }

  /**
   * Re-reads who is online. Called when the chat panel opens, so a live
   * update missed along the way (a phone asleep, a dropped socket) cannot
   * leave someone showing offline for the rest of the session.
   */
  refreshPresence(): void {
    if (this.connection && this.auth.accessToken) this.loadPresenceSnapshot();
  }

  isOnline(email: string | null | undefined): boolean {
    return !!email && this.onlineEmails().has(norm(email));
  }

  /** Only meaningful alongside {@link isOnline} — someone offline is never "away". */
  isAway(email: string | null | undefined): boolean {
    return !!email && this.awayEmails().has(norm(email));
  }

  /** Only meaningful alongside {@link isOnline} — someone offline is never "in call". */
  isInCall(email: string | null | undefined): boolean {
    return !!email && this.inCallEmails().has(norm(email));
  }

  /** When this person was last seen, ISO string, for an offline contact — null if never recorded. */
  lastSeen(email: string | null | undefined): string | null {
    return (email && this.lastSeenByEmail().get(norm(email))) || null;
  }

  presenceStatus(email: string | null | undefined): 'online' | 'away' | 'incall' | 'offline' {
    if (!this.isOnline(email)) return 'offline';
    // In-call wins over away: "busy on a call" is the more useful thing to show
    // someone deciding whether to interrupt than "idle".
    if (this.isInCall(email)) return 'incall';
    return this.isAway(email) ? 'away' : 'online';
  }

  /** Seeds last-seen times from directory entries, so an offline contact reads "last seen …" before any live event. */
  seedLastSeen(entries: { email: string; lastSeenOn?: string }[]): void {
    this.lastSeenByEmail.update(current => {
      const next = new Map(current);
      for (const e of entries) {
        if (e.lastSeenOn && !next.has(norm(e.email))) next.set(norm(e.email), e.lastSeenOn);
      }
      return next;
    });
  }

  /** Tells everyone else in a conversation this user started or stopped typing. Best-effort. */
  setTyping(conversationId: number, isTyping: boolean): void {
    this.connection?.invoke('SetTyping', conversationId, isTyping).catch(() => {});
  }

  /** The guest widget's {@link setTyping}, proved by its guest token. */
  setGuestTyping(conversationId: number, guestToken: string, isTyping: boolean): void {
    this.connection?.invoke('SetGuestTyping', conversationId, guestToken, isTyping).catch(() => {});
  }

  /** Broadcasts to everyone whether this user is on a call, so a third party sees them as busy. */
  /** STUN/TURN servers for calls, as configured on the server. */
  iceServers(): Promise<RTCIceServer[]> {
    return firstValueFrom(
      this.http.get<ApiResponse<RTCIceServer[]>>(`${this.base}/ice-servers`).pipe(map(r => r.data)));
  }

  setCallStatus(inCall: boolean): void {
    this.localInCall = inCall;
    // A call leaves the screen as the device found it: if it is off or the
    // app is in the background when the call ends, that is away now.
    if (inCall && this.localAway) { this.localAway = false; this.connection?.invoke('SetPresenceStatus', false).catch(() => {}); }
    this.connection?.invoke('SetCallStatus', inCall).catch(() => {});
    if (!inCall && document.hidden) { this.localAway = true; this.connection?.invoke('SetPresenceStatus', true).catch(() => {}); }
  }

  disconnect(): void {
    // Signing out is the one time the connection should stay down.
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.restartAttempt = 0;
    this.everStarted = false;
    void this.connection?.stop();
    this.connection = null;
    this.onlineEmails.set(new Set());
    this.awayEmails.set(new Set());
    this.inCallEmails.set(new Set());
    this.activityCleanup?.();
    this.activityCleanup = null;
    this.localAway = false;
  }

  async joinConversation(conversationId: number): Promise<void> {
    await this.connect();
    try {
      await this.connection?.invoke('JoinConversation', conversationId);
    } catch {
      // Live updates for this one conversation stay off; REST still works.
    }
  }

  async joinGuestConversation(conversationId: number, guestToken: string): Promise<void> {
    await this.connect();
    try {
      await this.connection?.invoke('JoinGuestConversation', conversationId, guestToken);
    } catch {
      // As above.
    }
  }

  /* ------------------------------------------------------------- calls */

  /** How long a call message waits for a slow or reconnecting connection before giving up. */
  private static readonly CALL_SEND_WAIT_MS = 15_000;

  /**
   * Sends one call message, waiting for the connection if it is still coming
   * up or reconnecting — on a slow network that is exactly when someone
   * presses Call. Fire-and-forget used to drop the invite silently then: the
   * caller heard ringing for 45 s and got "No answer" from a phone that never
   * rang. Resolves true once the server has it, false if it never got through.
   */
  private async sendCallMessage(method: string, ...args: unknown[]): Promise<boolean> {
    const deadline = Date.now() + ChatService.CALL_SEND_WAIT_MS;

    while (Date.now() < deadline) {
      const connection = this.connection;
      if (!connection) {
        await this.connect();
      } else if (connection.state === signalR.HubConnectionState.Connected) {
        // Sent on a live connection, the server has the message even if its
        // reply is slow. Still waiting when time runs out is "sent, reply
        // pending" — not a failure: reporting it as one told the caller their
        // connection was too weak while the other phone was ringing.
        const sent = connection.invoke(method, ...args).then(() => 'ok' as const, () => 'failed' as const);
        const outcome = await Promise.race([
          sent,
          new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), Math.max(0, deadline - Date.now())))
        ]);
        if (outcome !== 'failed') return true;
        // Dropped mid-send — fall through, wait for it to come back, try again.
      } else {
        this.reconnectNow();
      }
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    return false;
  }

  callInvite(targetEmail: string, callId: string, kind: 'audio' | 'video', fromName: string): Promise<boolean> {
    return this.sendCallMessage('CallInvite', targetEmail, callId, kind, fromName);
  }

  callRespond(targetEmail: string, callId: string, accepted: boolean): Promise<boolean> {
    return this.sendCallMessage('CallResponse', targetEmail, callId, accepted);
  }

  callSignal(targetEmail: string, callId: string, type: 'offer' | 'answer' | 'ice' | 'reaction', payload: string): Promise<boolean> {
    return this.sendCallMessage('CallSignal', targetEmail, callId, type, payload);
  }

  callHangup(targetEmail: string, callId: string): Promise<boolean> {
    return this.sendCallMessage('CallHangup', targetEmail, callId);
  }

  private params(values: Record<string, unknown>): HttpParams {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(values)) {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }

  /* -------------------------------------------------------------- guest */

  startGuestChat(name: string, contact: string | null, message: string): Observable<GuestStarted> {
    return this.http
      .post<ApiResponse<GuestStarted>>(`${this.base}/guest/start`, { name, contact, message })
      .pipe(map(r => r.data));
  }

  guestMessages(conversationId: number, guestToken: string): Observable<ChatMessage[]> {
    return this.http
      .get<ApiResponse<ChatMessage[]>>(`${this.base}/guest/${conversationId}/messages`, {
        params: this.params({ guestToken })
      })
      .pipe(map(r => r.data));
  }

  sendGuestMessage(
    conversationId: number, guestToken: string, body: string, attachment?: ChatAttachmentUpload
  ): Observable<ChatMessage> {
    return this.http
      .post<ApiResponse<ChatMessage>>(
        `${this.base}/guest/${conversationId}/messages`, { guestToken, body, attachment })
      .pipe(map(r => r.data));
  }

  /** A guest attachment's direct download URL — no auth header needed, the token in the query string is the credential. */
  guestAttachmentUrl(conversationId: number, messageId: number, guestToken: string): string {
    const params = this.params({ guestToken });
    return `${this.base}/guest/${conversationId}/messages/${messageId}/attachment?${params.toString()}`;
  }

  /* --------------------------------------------------------- signed in */

  directory(): Observable<ChatDirectoryEntry[]> {
    return this.http
      .get<ApiResponse<ChatDirectoryEntry[]>>(`${this.base}/directory`)
      .pipe(map(r => r.data));
  }

  myConversations(): Observable<ChatConversationSummary[]> {
    return this.http
      .get<ApiResponse<ChatConversationSummary[]>>(`${this.base}/conversations`)
      .pipe(map(r => r.data));
  }

  /** Every guest conversation, claimed or not — Admin/Editor/Receptionist only. */
  guestInbox(): Observable<ChatConversationSummary[]> {
    return this.http
      .get<ApiResponse<ChatConversationSummary[]>>(`${this.base}/guest-inbox`)
      .pipe(map(r => r.data));
  }

  startDirectChat(targetEmail: string): Observable<number> {
    return this.http
      .post<ApiResponse<number>>(`${this.base}/conversations/direct`, { targetEmail })
      .pipe(map(r => r.data));
  }

  startGroupChat(title: string, memberEmails: string[]): Observable<number> {
    return this.http
      .post<ApiResponse<number>>(`${this.base}/conversations/group`, { title, memberEmails })
      .pipe(map(r => r.data));
  }

  addGroupMember(conversationId: number, memberEmail: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(
      `${this.base}/conversations/${conversationId}/members`, { memberEmail });
  }

  messages(conversationId: number): Observable<ChatMessage[]> {
    return this.http
      .get<ApiResponse<ChatMessage[]>>(`${this.base}/conversations/${conversationId}/messages`)
      .pipe(map(r => r.data));
  }

  send(conversationId: number, body: string, attachment?: ChatAttachmentUpload): Observable<ChatMessage> {
    return this.http
      .post<ApiResponse<ChatMessage>>(
        `${this.base}/conversations/${conversationId}/messages`, { body, attachment })
      .pipe(map(r => r.data));
  }

  markRead(conversationId: number): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/conversations/${conversationId}/read`, {});
  }

  /** Clears the whole conversation from this user's view only; everyone else still sees it. */
  clearConversation(conversationId: number): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(`${this.base}/conversations/${conversationId}/clear`, {});
  }

  /** For everyone (own messages only — the server enforces it) or just from this user's view. */
  deleteMessages(conversationId: number, messageIds: number[], forEveryone: boolean): Observable<ApiResponse<unknown>> {
    return this.http.post<ApiResponse<unknown>>(
      `${this.base}/conversations/${conversationId}/messages/delete`, { messageIds, forEveryone });
  }

  /**
   * Downloads an attachment from a conversation the caller belongs to. Needs
   * the auth header the interceptor already attaches, so this goes through
   * HttpClient rather than a plain `<a href>` — then hands the browser a
   * blob URL to save, the same trick a plain link would have done natively.
   */
  async downloadAttachment(conversationId: number, messageId: number, fileName: string): Promise<void> {
    const blob = await firstValueFrom(this.http
      .get(`${this.base}/conversations/${conversationId}/messages/${messageId}/attachment`, {
        responseType: 'blob'
      }));
    saveBlob(blob, fileName);
  }
}

/** Case-insensitive key for presence — the server holds emails lower-cased. */
function norm(email: string): string {
  return email.trim().toLowerCase();
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  // Attached, and the URL kept alive a moment: some browsers ignore a click on
  // a detached link, and revoking straight after the click can cancel the
  // download before it has started.
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}

/** The VAPID public key arrives as URL-safe base64 text; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

/**
 * The sending side of "is typing": announces a start at most once every few
 * seconds while keys keep arriving, and a stop once the input goes quiet,
 * is cleared, or the message is sent — so the other side never has to guess.
 */
export class TypingReporter {
  private static readonly IDLE_MS = 3000;
  private static readonly RESEND_MS = 2500;

  private active = false;
  private lastSentAt = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly send: (isTyping: boolean) => void) {}

  /** Call on every change to the input, with whether it now holds any text. */
  input(hasText: boolean): void {
    if (!hasText) {
      this.stop();
      return;
    }

    const now = Date.now();
    if (!this.active || now - this.lastSentAt > TypingReporter.RESEND_MS) {
      this.active = true;
      this.lastSentAt = now;
      this.send(true);
    }

    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.stop(), TypingReporter.IDLE_MS);
  }

  stop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (!this.active) return;
    this.active = false;
    this.send(false);
  }
}

/**
 * The receiving side: who is typing in which conversation right now. Every
 * start also expires on its own, so a stop lost to a closed tab or dropped
 * connection never leaves someone "typing…" forever.
 */
export class TypingTracker {
  private static readonly EXPIRE_MS = 6000;

  /** conversationId → (typist key → display name). */
  readonly typists = signal<ReadonlyMap<number, ReadonlyMap<string, string>>>(new Map());
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  apply(e: ChatTypingChanged): void {
    const key = e.email ?? `guest:${e.name}`;
    const timerKey = `${e.conversationId}|${key}`;

    const existing = this.timers.get(timerKey);
    if (existing) clearTimeout(existing);
    this.timers.delete(timerKey);

    if (e.isTyping) {
      this.timers.set(timerKey, setTimeout(
        () => this.apply({ ...e, isTyping: false }), TypingTracker.EXPIRE_MS));
    }

    this.typists.update(current => {
      const next = new Map(current);
      const names = new Map(next.get(e.conversationId) ?? []);
      if (e.isTyping) names.set(key, e.name); else names.delete(key);
      if (names.size) next.set(e.conversationId, names); else next.delete(e.conversationId);
      return next;
    });
  }

  /** A typist's message arrived — they have obviously stopped typing it. */
  clear(conversationId: number, email: string | null | undefined, name: string): void {
    this.apply({ conversationId, email: email ?? null, name, isTyping: false });
  }

  /** "Asha is typing…", "Asha and Ravi are typing…", "3 people are typing…", or ''. */
  label(conversationId: number | null): string {
    if (conversationId === null) return '';
    const names = [...(this.typists().get(conversationId)?.values() ?? [])];
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names.length} people are typing…`;
  }

  has(conversationId: number | null): boolean {
    return conversationId !== null && this.typists().has(conversationId);
  }
}

/** Reads a picked file into the shape the send endpoints expect. */
export function readFileAsAttachment(file: File): Promise<ChatAttachmentUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      base64: reader.result as string
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
