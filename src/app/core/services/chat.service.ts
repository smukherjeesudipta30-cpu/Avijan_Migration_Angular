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
  ChatPresenceSnapshot,
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

  /** How long with no activity, or with the tab hidden, before this browser reports itself away. */
  private static readonly AWAY_AFTER_MS = 2 * 60 * 1000;

  private awayTimer: ReturnType<typeof setTimeout> | null = null;
  private localAway = false;
  private activityCleanup: (() => void) | null = null;

  /**
   * Opens the real-time connection. Safe to call repeatedly — a connection
   * already open or opening is reused. A failure here is not fatal to the
   * feature: every read and write still works over REST, just without the
   * live push until `withAutomaticReconnect` succeeds.
   */
  connect(): Promise<void> {
    if (this.connection) return Promise.resolve();
    if (this.connecting) return this.connecting;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.hubBaseUrl}/chat`, {
        accessTokenFactory: () => this.auth.accessToken ?? ''
      })
      .withAutomaticReconnect()
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

    connection.on('CallSignal', (fromEmail: string, callId: string, type: 'offer' | 'answer' | 'ice', payload: string) => {
      this.callSignal$.next({ fromEmail, callId, type, payload });
    });

    connection.on('CallEnded', (fromEmail: string, callId: string) => {
      this.callEnded$.next({ fromEmail, callId });
    });

    // 'online' | 'away' | 'offline' — a plain online/offline bool stopped being
    // enough once away became a third state rather than a variant of online.
    connection.on('PresenceChanged', (email: string, status: 'online' | 'away' | 'offline') => {
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
    });

    // A fresh connection has missed whatever presence changes happened before
    // it existed, so it needs a snapshot rather than only future deltas. The
    // guest widget has no token and no use for this — skipped for it.
    connection.onreconnected(() => this.loadPresenceSnapshot());

    this.connecting = connection
      .start()
      .then(() => {
        this.connection = connection;
        if (this.auth.accessToken) {
          this.loadPresenceSnapshot();
          this.setupActivityTracking(connection);
          void this.enablePushNotifications();
        }
      })
      .catch(() => {
        // REST keeps working regardless; withAutomaticReconnect will retry.
      })
      .finally(() => {
        this.connecting = null;
      });

    return this.connecting;
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
          this.onlineEmails.set(new Set(response.data.onlineEmails));
          this.awayEmails.set(new Set(response.data.awayEmails));
        },
        error: () => { /* presence is a courtesy; nothing to recover here */ }
      });
  }

  isOnline(email: string | null | undefined): boolean {
    return !!email && this.onlineEmails().has(email);
  }

  /** Only meaningful alongside {@link isOnline} — someone offline is never "away". */
  isAway(email: string | null | undefined): boolean {
    return !!email && this.awayEmails().has(email);
  }

  presenceStatus(email: string | null | undefined): 'online' | 'away' | 'offline' {
    if (!this.isOnline(email)) return 'offline';
    return this.isAway(email) ? 'away' : 'online';
  }

  disconnect(): void {
    void this.connection?.stop();
    this.connection = null;
    this.onlineEmails.set(new Set());
    this.awayEmails.set(new Set());
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

  callInvite(targetEmail: string, callId: string, kind: 'audio' | 'video', fromName: string): void {
    this.connection?.invoke('CallInvite', targetEmail, callId, kind, fromName).catch(() => {});
  }

  callRespond(targetEmail: string, callId: string, accepted: boolean): void {
    this.connection?.invoke('CallResponse', targetEmail, callId, accepted).catch(() => {});
  }

  callSignal(targetEmail: string, callId: string, type: 'offer' | 'answer' | 'ice', payload: string): void {
    this.connection?.invoke('CallSignal', targetEmail, callId, type, payload).catch(() => {});
  }

  callHangup(targetEmail: string, callId: string): void {
    this.connection?.invoke('CallHangup', targetEmail, callId).catch(() => {});
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

  /**
   * Downloads an attachment from a conversation the caller belongs to. Needs
   * the auth header the interceptor already attaches, so this goes through
   * HttpClient rather than a plain `<a href>` — then hands the browser a
   * blob URL to save, the same trick a plain link would have done natively.
   */
  downloadAttachment(conversationId: number, messageId: number, fileName: string): void {
    this.http
      .get(`${this.base}/conversations/${conversationId}/messages/${messageId}/attachment`, {
        responseType: 'blob'
      })
      .subscribe(blob => saveBlob(blob, fileName));
  }
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** The VAPID public key arrives as URL-safe base64 text; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
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
