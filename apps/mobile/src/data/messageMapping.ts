import { toUserSummary, type RawUser, type UserSummary } from "./userSummary";

/**
 * The longest message the API accepts - MAX_MESSAGE_LENGTH in
 * apps/api/src/validation/conversation.validation.js. Mirrored so the message
 * box stops the user before a send that could only be refused.
 */
export const MAX_MESSAGE_LENGTH = 2000;

/** One message as a chat shows it. */
export interface ChatMessage {
  id: string;
  body: string;
  /** Epoch ms, like FeedPost.createdAt. */
  createdAt: number;
  /**
   * Which side of the chat it sits on. Sent by the API rather than worked out
   * here, for the reason posts carry isMine: the app does not know which
   * account it is signed in as.
   */
  isMine: boolean;
  /**
   * Only on the sender's own optimistic copy: still on its way, or refused.
   * A message from the server never has one.
   */
  status?: "sending" | "failed";
  /**
   * The key this message was first drawn under, when that was a local
   * placeholder. Kept when the server's copy replaces the placeholder, so the
   * bubble is updated in place rather than drawn again - and its entrance
   * animation does not play twice.
   */
  localId?: string;
}

/** One row of the conversation list. */
export interface ConversationSummary {
  /** The other person. */
  user: UserSummary;
  lastMessage: ChatMessage;
  /** Messages from them not read yet. The badge counts PEOPLE with this above 0. */
  unreadCount: number;
  lastMessageAt: number;
}

/** A message as the API sends it, over REST and over the socket. */
export interface RawMessage {
  id: string;
  body: string;
  createdAt: string;
  isMine: boolean;
}

/** One row of GET /api/conversations. */
export interface RawConversation {
  user: RawUser;
  lastMessage: RawMessage;
  unreadCount: number;
  lastMessageAt: string;
}

export const toChatMessage = (raw: RawMessage): ChatMessage => ({
  id: raw.id,
  body: raw.body,
  createdAt: new Date(raw.createdAt).getTime(),
  isMine: raw.isMine,
});

export const toConversation = (raw: RawConversation): ConversationSummary => ({
  user: toUserSummary(raw.user),
  lastMessage: toChatMessage(raw.lastMessage),
  unreadCount: raw.unreadCount,
  lastMessageAt: new Date(raw.lastMessageAt).getTime(),
});
