import { Injectable, signal } from '@angular/core';

/**
 * Just the open/closed state and unread badge for the chat panel — shared
 * between the shell's toolbar button (which does not know about the panel's
 * internals) and the panel itself (mounted once, alongside the shell).
 */
@Injectable({ providedIn: 'root' })
export class ChatUiService {
  readonly open = signal(false);
  readonly unreadTotal = signal(0);

  toggle(): void {
    this.open.update(v => !v);
  }

  close(): void {
    this.open.set(false);
  }
}
