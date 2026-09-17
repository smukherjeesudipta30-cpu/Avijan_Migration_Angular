export type ChatConversationType = 'Direct' | 'Group' | 'Guest';

/** Someone the signed-in user is allowed to start a direct chat with. */
export interface ChatDirectoryEntry {
  email: string;
  displayName: string;
  role: string;
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  /** Absent when the sender was a guest. */
  senderEmail?: string;
  senderDisplayName: string;
  senderRole: string;
  body: string;
  sentOn: string;
  /** True when the viewer reading this was the one who sent it. */
  isMine: boolean;
  /** Set together, or not at all. */
  attachmentFileName?: string;
  attachmentContentType?: string;
  attachmentSize?: number;
  /** Direct conversations only — true once the other participant has read up to this message. */
  isSeen?: boolean;
}

/** A file picked for the next outgoing message, read into a data URL client-side. */
export interface ChatAttachmentUpload {
  fileName: string;
  contentType: string;
  base64: string;
}

export interface ChatParticipant {
  email?: string;
  displayName: string;
  role: string;
  /** Set only on the guest side of a Guest conversation. */
  contact?: string;
}

export interface ChatConversationSummary {
  id: number;
  type: ChatConversationType;
  /** Set for a Group only. */
  title?: string;
  participants: ChatParticipant[];
  lastMessagePreview?: string;
  lastMessageOn?: string;
  unreadCount: number;
}

/** Pushed live when someone reads up to a point in a conversation — flips the sender's own messages to "Seen". */
export interface ChatMessagesRead {
  conversationId: number;
  readerEmail: string;
  lastReadMessageId: number;
}

export interface GuestStarted {
  conversationId: number;
  guestToken: string;
  firstMessage: ChatMessage;
}

/** A one-off snapshot for hydrating the panel on open — awayEmails is always a subset of onlineEmails. */
export interface ChatPresenceSnapshot {
  onlineEmails: string[];
  awayEmails: string[];
}

export type CallKind = 'audio' | 'video';

/** Someone is calling — shown as the incoming-call screen. */
export interface IncomingCall {
  fromEmail: string;
  fromName: string;
  callId: string;
  kind: CallKind;
}

/** The other side answered or declined the call this browser started. */
export interface CallResponded {
  fromEmail: string;
  callId: string;
  accepted: boolean;
}

/** One SDP offer/answer or ICE candidate, relayed as-is — WebRTC decides what it means. */
export interface CallSignal {
  fromEmail: string;
  callId: string;
  type: 'offer' | 'answer' | 'ice';
  payload: string;
}

export interface CallEnded {
  fromEmail: string;
  callId: string;
}
