import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';

import {
  ChatAttachmentUpload,
  ChatConversationSummary,
  ChatDirectoryEntry,
  ChatMessage
} from '../../../core/models/chat.model';
import { AuthService } from '../../../core/services/auth.service';
import { CallService } from '../../../core/services/call.service';
import { ChatService, readFileAsAttachment } from '../../../core/services/chat.service';
import { ChatUiService } from '../../../core/services/chat-ui.service';

/** Comfortably under the server's 5 MB cap, checked client-side so a large pick fails fast. */
const MaxAttachmentBytes = 5 * 1024 * 1024;

type ChatPanelView = 'list' | 'thread' | 'new-direct' | 'new-group';
type ChatPanelTab = 'mine' | 'guest';

/**
 * The internal chat panel — a right-hand drawer opened from the shell's
 * toolbar. One conversation list (direct + group chats the signed-in person
 * belongs to), a "Guest inbox" tab for Admin/Editor/Receptionist, and one
 * thread view shared by every conversation kind.
 *
 * Mounted once alongside the shell rather than per-route, so it keeps its
 * SignalR connection and unread state across navigation instead of
 * reconnecting every time the page changes.
 */
@Component({
  selector: 'app-chat-panel',
  imports: [CommonModule, FormsModule, ButtonModule, DrawerModule, InputTextModule, TooltipModule],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss'
})
export class ChatPanelComponent {
  private readonly chat = inject(ChatService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly call = inject(CallService);
  readonly chatUi = inject(ChatUiService);

  readonly isStaff = computed(() => this.auth.hasAnyRole(['Admin', 'Editor', 'Receptionist']));

  readonly view = signal<ChatPanelView>('list');
  readonly tab = signal<ChatPanelTab>('mine');

  readonly conversations = signal<ChatConversationSummary[]>([]);
  readonly guestConversations = signal<ChatConversationSummary[]>([]);
  readonly loadingConversations = signal(false);

  readonly activeConversationId = signal<number | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly loadingMessages = signal(false);
  readonly messageInput = signal('');
  readonly sending = signal(false);
  readonly pendingAttachment = signal<ChatAttachmentUpload | null>(null);
  readonly attachmentError = signal<string | null>(null);

  readonly directory = signal<ChatDirectoryEntry[]>([]);
  readonly directoryLoading = signal(false);
  readonly directorySearch = signal('');

  readonly groupTitle = signal('');
  readonly groupSelectedEmails = signal<string[]>([]);
  readonly startingChat = signal(false);

  private joinedConversationIds = new Set<number>();
  private initialized = false;

  readonly activeConversation = computed<ChatConversationSummary | null>(() => {
    const id = this.activeConversationId();
    if (id === null) return null;
    return (
      this.conversations().find(c => c.id === id) ??
      this.guestConversations().find(c => c.id === id) ??
      null
    );
  });

  readonly threadTitle = computed(() => {
    const c = this.activeConversation();
    if (!c) return '';

    if (c.type === 'Group') return c.title ?? 'Group';

    if (c.type === 'Guest') {
      const guest = c.participants.find(p => p.role === 'Guest');
      return guest ? `${guest.displayName} · Guest` : 'Guest';
    }

    const me = this.auth.user()?.email;
    const other = c.participants.find(p => p.email !== me);
    return other?.displayName ?? 'Chat';
  });

  readonly threadSubtitle = computed(() => {
    const c = this.activeConversation();
    if (!c) return '';

    if (c.type === 'Group') return `${c.participants.length} members`;

    if (c.type === 'Guest') {
      const guest = c.participants.find(p => p.role === 'Guest');
      return guest?.contact ? guest.contact : 'Website visitor';
    }

    const me = this.auth.user()?.email;
    const other = c.participants.find(p => p.email !== me);
    return other?.role ?? '';
  });

  /** Direct only — a Group's or a Guest thread's header shows no single presence dot. */
  readonly threadOnline = computed(() => {
    const c = this.activeConversation();
    if (!c || c.type !== 'Direct') return false;

    const me = this.auth.user()?.email;
    const other = c.participants.find(p => p.email !== me);
    return this.chat.isOnline(other?.email);
  });

  /** Same "Direct only" rule as {@link threadOnline} — only meaningful when that is true. */
  readonly threadAway = computed(() => {
    const c = this.activeConversation();
    if (!c || c.type !== 'Direct') return false;

    const me = this.auth.user()?.email;
    const other = c.participants.find(p => p.email !== me);
    return this.chat.isAway(other?.email);
  });

  /** Same "Direct only" rule — whether the other person is on a call right now. */
  readonly threadInCall = computed(() => {
    const c = this.activeConversation();
    if (!c || c.type !== 'Direct') return false;

    const me = this.auth.user()?.email;
    const other = c.participants.find(p => p.email !== me);
    return this.chat.isInCall(other?.email);
  });

  /** Set to a conversation id while the other side is typing there; lapses on its own. */
  readonly typingConversationId = signal<number | null>(null);
  private typingClearTimer: ReturnType<typeof setTimeout> | null = null;

  readonly threadTyping = computed(() =>
    this.threadIsDirect() && this.typingConversationId() === this.activeConversationId());

  /** ISO last-seen for the other person, shown only when they are offline. */
  readonly threadLastSeen = computed(() => {
    const c = this.activeConversation();
    if (!c || c.type !== 'Direct') return null;

    const me = this.auth.user()?.email;
    const other = c.participants.find(p => p.email !== me);
    if (this.chat.isOnline(other?.email)) return null;
    return this.chat.lastSeen(other?.email);
  });

  /** The single status line under a direct thread's name, in order of what's most useful to show. */
  readonly threadStatusLabel = computed<string>(() => {
    if (!this.threadIsDirect()) return '';
    if (this.threadTyping()) return 'typing…';
    if (this.threadInCall()) return 'In call';
    if (this.threadOnline()) return this.threadAway() ? 'Away' : 'Online';

    const seen = this.threadLastSeen();
    return seen ? `last seen ${this.formatLastSeen(seen)}` : 'Offline';
  });

  private formatLastSeen(iso: string): string {
    const then = new Date(iso);
    const mins = Math.floor((Date.now() - then.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;

    const sameDay = then.toDateString() === new Date().toDateString();
    const time = then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return sameDay ? `today at ${time}` : `${then.toLocaleDateString()} ${time}`;
  }

  /** Called as the viewer types, to tell the other end. Throttled so it is not one call per keystroke. */
  private lastTypingSentAt = 0;
  notifyTyping(): void {
    const other = this.threadOther();
    const conversationId = this.activeConversationId();
    if (!other || conversationId === null) return;

    const now = Date.now();
    if (now - this.lastTypingSentAt < 2500) return;
    this.lastTypingSentAt = now;
    this.chat.sendTyping(other.email, conversationId);
  }

  readonly threadIsDirect = computed(() => this.activeConversation()?.type === 'Direct');

  private threadOther(): { email: string; name: string } | null {
    const c = this.activeConversation();
    if (!c || c.type !== 'Direct') return null;

    const me = this.auth.user()?.email;
    const other = c.participants.find(p => p.email !== me);
    return other?.email ? { email: other.email, name: other.displayName } : null;
  }

  startAudioCall(): void {
    const other = this.threadOther();
    const conversationId = this.activeConversationId();
    if (other && conversationId !== null) void this.call.startCall(other.email, other.name, 'audio', conversationId);
  }

  startVideoCall(): void {
    const other = this.threadOther();
    const conversationId = this.activeConversationId();
    if (other && conversationId !== null) void this.call.startCall(other.email, other.name, 'video', conversationId);
  }

  readonly filteredDirectory = computed<ChatDirectoryEntry[]>(() => {
    const q = this.directorySearch().trim().toLowerCase();
    const all = this.directory();
    if (!q) return all;
    return all.filter(
      d => d.displayName.toLowerCase().includes(q) || d.role.toLowerCase().includes(q));
  });

  readonly groupCandidates = computed<ChatDirectoryEntry[]>(() => this.filteredDirectory());

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.chat.onMessage.pipe(takeUntilDestroyed(destroyRef)).subscribe(message => {
      const isOpenHere = this.chatUi.open() && message.conversationId === this.activeConversationId();

      if (message.conversationId === this.activeConversationId()) {
        this.messages.update(list =>
          list.some(m => m.id === message.id) ? list : [...list, message]);
      }

      if (isOpenHere) {
        this.chat.markRead(message.conversationId).subscribe();
      } else if (!message.isMine) {
        // The panel is closed, or open on a different conversation — a silent
        // badge is easy to miss entirely, so this is also a toast, the same
        // way the rest of the app surfaces something that just happened.
        this.toast.add({
          severity: 'info',
          summary: `New message from ${message.senderDisplayName}`,
          detail: message.body || (message.attachmentFileName ? `📎 ${message.attachmentFileName}` : ''),
          life: 6000
        });
      }

      this.refreshConversations();
    });

    this.chat.onConversationsChanged.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      this.refreshConversations();
    });

    this.chat.onMessagesRead.pipe(takeUntilDestroyed(destroyRef)).subscribe(read => {
      if (read.conversationId !== this.activeConversationId()) return;

      this.messages.update(list =>
        list.map(m => (m.isMine && m.id <= read.lastReadMessageId ? { ...m, isSeen: true } : m)));
    });

    this.chat.onTyping.pipe(takeUntilDestroyed(destroyRef)).subscribe(({ fromEmail, conversationId }) => {
      // Only the thread currently open, and only the other person — never echo
      // the viewer's own typing back at them.
      if (conversationId !== this.activeConversationId()) return;
      const me = this.auth.user()?.email;
      if (fromEmail === me) return;

      this.typingConversationId.set(conversationId);
      if (this.typingClearTimer) clearTimeout(this.typingClearTimer);
      // A typing ping has no matching "stopped"; it simply lapses if none
      // arrives within a few seconds, which every keystroke renews.
      this.typingClearTimer = setTimeout(() => this.typingConversationId.set(null), 4000);
    });

    this.chat.onGuestInboxChanged.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      if (this.isStaff()) {
        this.refreshGuestInbox();

        if (!this.chatUi.open()) {
          this.toast.add({
            severity: 'info',
            summary: 'New chat from the website',
            detail: 'A visitor has started a conversation — see the Guest inbox.',
            life: 6000
          });
        }
      }
    });

    /* Connects and loads the unread count the moment this person is signed
       in — not gated on ever opening the panel. A silent badge that only
       starts working after the first manual open defeats the entire point of
       a notification: the whole reason to have one is for someone who has
       NOT opened chat yet. The conversation/message BODIES stay lazy
       (fetched only once a thread is actually opened); this is just the
       count and the live connection. */
    effect(() => {
      if (this.auth.isAuthenticated() && !this.initialized) {
        this.initialized = true;
        void this.chat.connect();
        this.refreshConversations();
        if (this.isStaff()) this.refreshGuestInbox();
      }
    });
  }

  private refreshConversations(): void {
    this.loadingConversations.set(true);
    this.chat.myConversations().subscribe({
      next: rows => {
        this.conversations.set(rows);
        this.loadingConversations.set(false);
        this.recomputeUnread();
      },
      error: () => this.loadingConversations.set(false)
    });
  }

  private refreshGuestInbox(): void {
    this.chat.guestInbox().subscribe({
      next: rows => {
        this.guestConversations.set(rows);
        this.recomputeUnread();
      }
    });
  }

  private recomputeUnread(): void {
    const mine = this.conversations().reduce((sum, c) => sum + c.unreadCount, 0);
    this.chatUi.unreadTotal.set(mine);
  }

  /** Real unread count now that the server tracks it for guest threads too — not just "any thread is open". */
  readonly guestUnreadCount = computed(() =>
    this.guestConversations().reduce((sum, c) => sum + c.unreadCount, 0));

  /* -------------------------------------------------------------- nav */

  showList(): void {
    this.view.set('list');
    this.activeConversationId.set(null);
    this.messages.set([]);
  }

  selectTab(tab: ChatPanelTab): void {
    this.tab.set(tab);
    this.showList();
  }

  openConversation(id: number): void {
    this.activeConversationId.set(id);
    this.view.set('thread');
    this.messages.set([]);
    this.loadingMessages.set(true);

    this.chat.messages(id).subscribe({
      next: rows => {
        this.messages.set(rows);
        this.loadingMessages.set(false);
      },
      error: () => this.loadingMessages.set(false)
    });

    if (!this.joinedConversationIds.has(id)) {
      this.joinedConversationIds.add(id);
      void this.chat.joinConversation(id);
    }

    // Whichever list this conversation actually lives in needs the refresh —
    // rather than branch on which, both are cheap enough to just always redo,
    // and it's what keeps the guest-inbox badge from going stale after read.
    this.chat.markRead(id).subscribe(() => {
      this.refreshConversations();
      this.refreshGuestInbox();
    });
  }

  sendMessage(): void {
    const body = this.messageInput().trim();
    const attachment = this.pendingAttachment();
    const id = this.activeConversationId();
    if ((!body && !attachment) || id === null || this.sending()) return;

    this.sending.set(true);

    this.chat.send(id, body, attachment ?? undefined).subscribe({
      next: message => {
        this.sending.set(false);
        this.messageInput.set('');
        this.pendingAttachment.set(null);
        this.messages.update(list =>
          list.some(m => m.id === message.id) ? list : [...list, message]);
        this.refreshConversations();
      },
      error: () => this.sending.set(false)
    });
  }

  /** Reads the picked file client-side and holds it ready for the next send — no upload yet. */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.attachmentError.set(null);

    if (file.size > MaxAttachmentBytes) {
      this.attachmentError.set(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`);
      return;
    }

    this.pendingAttachment.set(await readFileAsAttachment(file));
  }

  clearPendingAttachment(): void {
    this.pendingAttachment.set(null);
    this.attachmentError.set(null);
  }

  /**
   * Every attachment in the internal panel is shown as a file chip with a
   * Download button, never an inline `<img>` — the file sits behind an
   * authenticated endpoint, and a plain `<img src>` has no way to carry the
   * bearer token a browser needs to fetch it. (The guest widget's endpoint is
   * different: the token travels in the query string there, so it previews
   * images directly.)
   */
  downloadAttachment(message: ChatMessage): void {
    if (!message.attachmentFileName) return;
    this.chat.downloadAttachment(message.conversationId, message.id, message.attachmentFileName);
  }

  formatAttachmentSize(bytes: number | undefined): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /* --------------------------------------------------------- new chat */

  openNewDirect(): void {
    this.view.set('new-direct');
    this.directorySearch.set('');
    this.loadDirectory();
  }

  openNewGroup(): void {
    this.view.set('new-group');
    this.groupTitle.set('');
    this.groupSelectedEmails.set([]);
    this.directorySearch.set('');
    this.loadDirectory();
  }

  private loadDirectory(): void {
    if (this.directory().length > 0) return;

    this.directoryLoading.set(true);
    this.chat.directory().subscribe({
      next: rows => {
        this.directory.set(rows);
        // Seed last-seen so an offline contact reads "last seen …" straight
        // away, before any live presence event has had to arrive.
        this.chat.seedLastSeen(rows);
        this.directoryLoading.set(false);
      },
      error: () => this.directoryLoading.set(false)
    });
  }

  pickDirectPerson(entry: ChatDirectoryEntry): void {
    if (this.startingChat()) return;
    this.startingChat.set(true);

    this.chat.startDirectChat(entry.email).subscribe({
      next: id => {
        this.startingChat.set(false);
        this.refreshConversations();
        this.openConversation(id);
      },
      error: () => this.startingChat.set(false)
    });
  }

  toggleGroupMember(email: string): void {
    this.groupSelectedEmails.update(list =>
      list.includes(email) ? list.filter(e => e !== email) : [...list, email]);
  }

  isGroupMemberSelected(email: string): boolean {
    return this.groupSelectedEmails().includes(email);
  }

  createGroup(): void {
    const title = this.groupTitle().trim();
    const members = this.groupSelectedEmails();
    if (!title || members.length === 0 || this.startingChat()) return;

    this.startingChat.set(true);

    this.chat.startGroupChat(title, members).subscribe({
      next: id => {
        this.startingChat.set(false);
        this.refreshConversations();
        this.openConversation(id);
      },
      error: () => this.startingChat.set(false)
    });
  }

  /* --------------------------------------------------- conversation list */

  conversationTitle(c: ChatConversationSummary): string {
    if (c.type === 'Group') return c.title ?? 'Group';

    if (c.type === 'Guest') {
      const guest = c.participants.find(p => p.role === 'Guest');
      return guest?.displayName ?? 'Guest';
    }

    const me = this.auth.user()?.email;
    const other = c.participants.find(p => p.email !== me);
    return other?.displayName ?? 'Chat';
  }

  conversationTime(c: ChatConversationSummary): string | undefined {
    return c.lastMessageOn;
  }

  presenceStatus(email: string | null | undefined): 'online' | 'away' | 'incall' | 'offline' {
    return this.chat.presenceStatus(email);
  }

  /** Presence only means anything for a Direct chat — a Group or a Guest thread has no single "them". */
  conversationPresence(c: ChatConversationSummary): 'online' | 'away' | 'incall' | 'offline' {
    if (c.type !== 'Direct') return 'offline';
    const me = this.auth.user()?.email;
    const other = c.participants.find(p => p.email !== me);
    return this.chat.presenceStatus(other?.email);
  }

  /* -------------------------------------------------------------- misc */

  initials(name: string | undefined): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return '?';

    return trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}
