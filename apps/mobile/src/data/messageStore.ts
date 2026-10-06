import { useSyncExternalStore } from "react";

import {
  toChatMessage,
  type ChatMessage,
  type ConversationSummary,
  type RawMessage,
} from "./messageMapping";
import { toUserSummary, type RawUser, type UserSummary } from "./userSummary";

/**
 * Direct messages: the conversation list, the badge, and every chat opened
 * this session - shared by everything that shows them.
 *
 * Module state behind useSyncExternalStore, the notificationStore pattern, for
 * the same reason: the REST reads, the optimistic sends and the socket all
 * write here, and the Home badge, the list and an open chat all read it.
 *
 * Chats are held newest-first, the order an inverted list draws bottom-up, so
 * a new message is always prepended and an older page always appended.
 */
export interface ChatState {
  messages: ChatMessage[];
  /** Whether there are older messages the server has not sent yet. */
  hasMore: boolean;
  loaded: boolean;
}

export interface MessageState {
  /** Most recently active first. */
  conversations: ConversationSummary[];
  /** PEOPLE with unread messages - what the badge shows. The API's own count. */
  unread: number;
  /** False until the list's first read lands. */
  loaded: boolean;
  /** Keyed by the other person's id - a 1:1 chat IS the pair. */
  chats: Record<string, ChatState>;
}

/** What the socket delivers when a message is written, to either side. */
export interface MessageCreatedEvent {
  with: RawUser;
  message: RawMessage;
  /** Unread messages in this conversation for THIS reader - 0 for the sender. */
  unreadCount: number;
  /** This reader's badge total after the write. */
  unreadConversations: number;
}

const EMPTY: MessageState = { conversations: [], unread: 0, loaded: false, chats: {} };

let state: MessageState = EMPTY;
const listeners = new Set<() => void>();

/**
 * The chat on screen right now, if any.
 *
 * Not in `state`: nothing renders from it. It changes what an incoming
 * message MEANS - one for the chat being looked at is read the moment it
 * arrives, so it must not light the badge for the instant before useChat marks
 * it read on the server. Without this the counter would flicker up and back
 * down for every message in an open conversation.
 */
let activeChat: string | null = null;

const commit = (next: MessageState): void => {
  state = next;
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getSnapshot = (): MessageState => state;

export const useMessageState = (): MessageState =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

export const setActiveChat = (userId: string | null): void => {
  activeChat = userId;
};

export const getActiveChat = (): string | null => activeChat;

const keyOf = (message: ChatMessage): string => message.localId ?? message.id;

/** Moves one person's row to the top, replacing what was there. */
const withConversationOnTop = (summary: ConversationSummary): ConversationSummary[] => [
  summary,
  ...state.conversations.filter((row) => row.user.id !== summary.user.id),
];

const withChat = (userId: string, chat: ChatState): Record<string, ChatState> => ({
  ...state.chats,
  [userId]: chat,
});

/** A fresh list from the API, with the API's own badge count. */
export const setConversations = (conversations: ConversationSummary[], unread: number): void => {
  commit({ ...state, conversations, unread, loaded: true });
};

export const setUnread = (unread: number): void => {
  if (state.unread === unread) return;
  commit({ ...state, unread });
};

/**
 * A page of history. Page one (no cursor) replaces what is held - except
 * messages still on their way or refused, which exist only on this phone and
 * would otherwise vanish from under the person who just typed them. An older
 * page is appended, skipping anything already held.
 */
export const setHistory = (
  userId: string,
  page: ChatMessage[],
  hasMore: boolean,
  isOlderPage: boolean,
): void => {
  const current = state.chats[userId];

  if (isOlderPage && current) {
    const held = new Set(current.messages.map((message) => message.id));
    commit({
      ...state,
      chats: withChat(userId, {
        messages: [...current.messages, ...page.filter((message) => !held.has(message.id))],
        hasMore,
        loaded: true,
      }),
    });
    return;
  }

  const local = current?.messages.filter((message) => message.status) ?? [];
  const fromServer = new Set(page.map((message) => message.id));
  // A resolved message keeps its placeholder's key; carry that over so a
  // refetch does not redraw (and re-animate) a bubble that is already there.
  const keys = new Map(
    (current?.messages ?? [])
      .filter((message) => message.localId && fromServer.has(message.id))
      .map((message) => [message.id, message.localId]),
  );
  commit({
    ...state,
    chats: withChat(userId, {
      messages: [
        ...local,
        ...page.map((message) =>
          keys.has(message.id) ? { ...message, localId: keys.get(message.id) } : message,
        ),
      ],
      hasMore,
      loaded: true,
    }),
  });
};

/** A message the person just sent, drawn before the server has answered. */
export const addPending = (userId: string, message: ChatMessage): void => {
  const current = state.chats[userId] ?? { messages: [], hasMore: false, loaded: true };
  commit({
    ...state,
    chats: withChat(userId, { ...current, messages: [message, ...current.messages] }),
  });
};

/** Marks a placeholder as sending again - a retry. */
export const markSending = (userId: string, localId: string): void => {
  const current = state.chats[userId];
  if (!current) return;
  commit({
    ...state,
    chats: withChat(userId, {
      ...current,
      messages: current.messages.map((message) =>
        message.id === localId ? { ...message, status: "sending" } : message,
      ),
    }),
  });
};

/**
 * The server stored it: the placeholder becomes the real message, in place,
 * and the conversation moves to the top of the list with the sender's view of
 * it - nothing unread, since you cannot owe yourself a reply.
 *
 * If the socket's copy got here first and already replaced the placeholder,
 * this finds nothing to swap and only touches the list - which is idempotent.
 */
export const resolvePending = (user: UserSummary, localId: string, message: ChatMessage): void => {
  const current = state.chats[user.id];
  let chats = state.chats;

  if (current) {
    const hasServerCopy = current.messages.some((held) => held.id === message.id);
    const messages = hasServerCopy
      ? current.messages.filter((held) => held.id !== localId)
      : current.messages.map((held) =>
          held.id === localId ? { ...message, localId } : held,
        );
    chats = withChat(user.id, { ...current, messages });
  }

  const previous = state.conversations.find((row) => row.user.id === user.id);
  commit({
    ...state,
    chats,
    conversations: withConversationOnTop({
      user,
      lastMessage: message,
      unreadCount: previous?.unreadCount ?? 0,
      lastMessageAt: message.createdAt,
    }),
  });
};

/** The server refused it, or it never arrived: kept, marked, offered for retry. */
export const failPending = (userId: string, localId: string): void => {
  const current = state.chats[userId];
  if (!current) return;
  commit({
    ...state,
    chats: withChat(userId, {
      ...current,
      messages: current.messages.map((message) =>
        message.id === localId ? { ...message, status: "failed" } : message,
      ),
    }),
  });
};

/** Drops one message from a chat - a refused message the person discarded. */
export const discardMessage = (userId: string, id: string): void => {
  const current = state.chats[userId];
  if (!current) return;
  commit({
    ...state,
    chats: withChat(userId, {
      ...current,
      messages: current.messages.filter((message) => keyOf(message) !== id && message.id !== id),
    }),
  });
};

/**
 * A message written to one of this person's conversations, from the socket -
 * either someone writing to them, or them writing from another device.
 *
 * Their OWN message replaces the oldest matching placeholder still sending
 * (same text) rather than appearing beside it: the socket often beats the HTTP
 * answer to the same send, and two identical bubbles for one message would be
 * a visible bug.
 */
export const receive = (event: MessageCreatedEvent): void => {
  const user = toUserSummary(event.with);
  const message = toChatMessage(event.message);
  const current = state.chats[user.id];
  let chats = state.chats;

  if (current && !current.messages.some((held) => held.id === message.id)) {
    let messages: ChatMessage[];
    const pendingIndex = message.isMine
      ? current.messages.findLastIndex(
          (held) => held.status === "sending" && held.body === message.body,
        )
      : -1;
    if (pendingIndex >= 0) {
      const placeholder = current.messages[pendingIndex];
      messages = current.messages.map((held, index) =>
        index === pendingIndex ? { ...message, localId: placeholder.id } : held,
      );
    } else {
      messages = [message, ...current.messages];
    }
    chats = withChat(user.id, { ...current, messages });
  }

  // A message for the chat on screen is read on arrival - see activeChat.
  const isOnScreen = activeChat === user.id;
  const unreadCount = isOnScreen ? 0 : event.unreadCount;
  const unread =
    isOnScreen && event.unreadCount > 0
      ? Math.max(0, event.unreadConversations - 1)
      : event.unreadConversations;

  commit({
    ...state,
    chats,
    unread,
    conversations: withConversationOnTop({
      user,
      lastMessage: message,
      unreadCount,
      lastMessageAt: message.createdAt,
    }),
  });
};

/**
 * One conversation read - here, or on another of this person's devices.
 *
 * The badge only drops when this row was actually counted. The device that did
 * the reading calls this AND then hears the server's conversation:read for the
 * same chat; without the guard the second would subtract the same person twice.
 */
export const markReadLocal = (userId: string): void => {
  const row = state.conversations.find((conversation) => conversation.user.id === userId);
  if (!row || row.unreadCount === 0) return;
  commit({
    ...state,
    unread: Math.max(0, state.unread - 1),
    conversations: state.conversations.map((conversation) =>
      conversation.user.id === userId ? { ...conversation, unreadCount: 0 } : conversation,
    ),
  });
};

/**
 * Empties the store on sign-out, for postStore's reason: the next account to
 * sign in on this phone must never see the last one's conversations.
 */
export const resetMessages = (): void => {
  activeChat = null;
  if (state !== EMPTY) commit(EMPTY);
};
