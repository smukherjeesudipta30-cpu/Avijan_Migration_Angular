import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

import { ChatAttachmentUpload, ChatMessage } from '../../../core/models/chat.model';
import {
  ChatService,
  TypingReporter,
  TypingTracker,
  readFileAsAttachment
} from '../../../core/services/chat.service';

const CONVERSATION_KEY = 'avijan.guestChat.conversationId';
const TOKEN_KEY = 'avijan.guestChat.token';

/** Matches the server's cap — checked client-side so a large pick fails fast. */
const MaxAttachmentBytes = 5 * 1024 * 1024;

/**
 * The public "Chat with us" bubble — the anonymous side of the chat feature,
 * mounted once at the app root and shown only to a visitor who is not signed
 * in. No account: the conversation this browser owns is remembered by a
 * token in localStorage rather than a login, and returning to the site later
 * (same browser) reopens the same thread instead of starting a new one.
 */
@Component({
  selector: 'app-guest-chat-widget',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule],
  templateUrl: './guest-widget.component.html',
  styleUrl: './guest-widget.component.scss'
})
export class GuestWidgetComponent {
  private readonly chat = inject(ChatService);

  readonly open = signal(false);
  readonly started = signal(false);
  readonly conversationId = signal<number | null>(null);
  private guestToken: string | null = null;

  readonly name = signal('');
  readonly contact = signal('');
  readonly firstMessage = signal('');
  readonly starting = signal(false);
  readonly startError = signal<string | null>(null);

  readonly messages = signal<ChatMessage[]>([]);
  readonly loadingMessages = signal(false);
  readonly messageInput = signal('');
  readonly sending = signal(false);
  readonly pendingAttachment = signal<ChatAttachmentUpload | null>(null);
  readonly attachmentError = signal<string | null>(null);

  /** The front desk typing a reply. */
  readonly typing = new TypingTracker();
  readonly typingLabel = computed(() => {
    this.typing.typists();
    return this.typing.label(this.conversationId());
  });

  private readonly typingReporter = new TypingReporter(isTyping => {
    const id = this.conversationId();
    if (id !== null && this.guestToken) this.chat.setGuestTyping(id, this.guestToken, isTyping);
  });

  constructor() {
    const storedId = localStorage.getItem(CONVERSATION_KEY);
    const storedToken = localStorage.getItem(TOKEN_KEY);

    if (storedId && storedToken) {
      this.conversationId.set(Number(storedId));
      this.guestToken = storedToken;
      this.started.set(true);
    }

    const destroyRef = inject(DestroyRef);

    this.chat.onMessage.pipe(takeUntilDestroyed(destroyRef)).subscribe(message => {
      if (message.conversationId === this.conversationId()) {
        if (!message.isMine) this.typing.clear(message.conversationId, message.senderEmail, message.senderDisplayName);
        this.messages.update(list =>
          list.some(m => m.id === message.id) ? list : [...list, message]);
      }
    });

    this.chat.onTypingChanged.pipe(takeUntilDestroyed(destroyRef)).subscribe(e => {
      // Only staff typing matters here — the guest's own other tab reports with no email.
      if (e.conversationId === this.conversationId() && e.email) this.typing.apply(e);
    });

    this.chat.onMessagesDeleted.pipe(takeUntilDestroyed(destroyRef)).subscribe(e => {
      if (e.conversationId !== this.conversationId()) return;
      const ids = new Set(e.messageIds);
      this.messages.update(list => list.map(m => ids.has(m.id)
        ? { ...m, body: '', isDeleted: true, attachmentFileName: undefined, attachmentContentType: undefined }
        : m));
    });

    this.chat.onReconnected.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
      const id = this.conversationId();
      if (!this.open() || id === null || !this.guestToken) return;
      void this.chat.joinGuestConversation(id, this.guestToken);
      this.loadMessages();
    });
  }

  onComposerInput(value: string): void {
    this.messageInput.set(value);
    this.typingReporter.input(value.trim().length > 0);
  }

  toggle(): void {
    this.open.update(v => !v);

    if (this.open() && this.started() && this.conversationId() !== null && this.guestToken) {
      this.loadMessages();
      void this.chat.joinGuestConversation(this.conversationId()!, this.guestToken);
    }
  }

  private loadMessages(): void {
    const id = this.conversationId();
    if (id === null || !this.guestToken) return;

    this.loadingMessages.set(true);
    this.chat.guestMessages(id, this.guestToken).subscribe({
      next: rows => {
        this.messages.set(rows);
        this.loadingMessages.set(false);
      },
      error: () => this.loadingMessages.set(false)
    });
  }

  startChat(): void {
    const name = this.name().trim();
    const message = this.firstMessage().trim();

    if (!name || !message || this.starting()) {
      this.startError.set(!name ? 'Tell us your name.' : !message ? 'Type a message.' : null);
      return;
    }

    this.starting.set(true);
    this.startError.set(null);

    this.chat.startGuestChat(name, this.contact().trim() || null, message).subscribe({
      next: result => {
        this.starting.set(false);
        this.started.set(true);
        this.conversationId.set(result.conversationId);
        this.guestToken = result.guestToken;
        this.messages.set([result.firstMessage]);

        localStorage.setItem(CONVERSATION_KEY, String(result.conversationId));
        localStorage.setItem(TOKEN_KEY, result.guestToken);

        void this.chat.joinGuestConversation(result.conversationId, result.guestToken);
      },
      error: () => {
        this.starting.set(false);
        this.startError.set('That could not be sent. Please try again.');
      }
    });
  }

  sendMessage(): void {
    const body = this.messageInput().trim();
    const attachment = this.pendingAttachment();
    const id = this.conversationId();
    if ((!body && !attachment) || id === null || !this.guestToken || this.sending()) return;

    this.sending.set(true);
    this.typingReporter.stop();

    this.chat.sendGuestMessage(id, this.guestToken, body, attachment ?? undefined).subscribe({
      next: message => {
        this.sending.set(false);
        this.messageInput.set('');
        this.pendingAttachment.set(null);
        this.messages.update(list =>
          list.some(m => m.id === message.id) ? list : [...list, message]);
      },
      error: () => this.sending.set(false)
    });
  }

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

  isImageAttachment(message: ChatMessage): boolean {
    return !!message.attachmentContentType?.startsWith('image/');
  }

  /** The token travels in the query string here, so an <img> can load it directly — no auth header needed. */
  attachmentUrl(message: ChatMessage): string {
    return this.guestToken
      ? this.chat.guestAttachmentUrl(message.conversationId, message.id, this.guestToken)
      : '';
  }
}
