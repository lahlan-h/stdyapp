import { request } from "./api";
import { isSignedIn, withAuth } from "./auth";
import {
  toChatMessage,
  toConversation,
  type ChatMessage,
  type RawConversation,
  type RawMessage,
} from "./messageMapping";
import * as messageStore from "./messageStore";

/**
 * How many conversations the list reads. One page, no paging: the list is
 * who you have been talking to lately, and fifty is far past where anyone
 * scrolls.
 */
const CONVERSATION_PAGE = 50;

/** One screenful of bubbles - DEFAULT_HISTORY_PAGE on the API. */
const HISTORY_PAGE = 30;

interface ListResponse {
  data: RawConversation[];
}

interface UnreadResponse {
  unread: number;
}

interface HistoryResponse {
  data: RawMessage[];
  hasMore: boolean;
}

interface SendResponse {
  data: RawMessage;
}

/**
 * Reads the conversation list and the badge into the store, together.
 *
 * Called on first use and again on every socket (re)connect, which is what
 * makes the socket safe to lose: anything sent while it was down is in this
 * read. Dropped if the user signed out mid-flight, so one account's
 * conversations can never land in the next account's store.
 */
export const loadConversations = async (): Promise<void> => {
  const [list, count] = await Promise.all([
    withAuth((token) =>
      request<ListResponse>(`/api/conversations?limit=${CONVERSATION_PAGE}`, { token }),
    ),
    withAuth((token) => request<UnreadResponse>("/api/conversations/unread-count", { token })),
  ]);
  if (!isSignedIn()) return;
  messageStore.setConversations(list.data.map(toConversation), count.unread);
};

/**
 * One page of history with one person into the store. No cursor reads the
 * newest page; `before` (the oldest message held) reads the page behind it.
 */
export const loadHistory = async (userId: string, before?: string): Promise<void> => {
  const query = `limit=${HISTORY_PAGE}${before ? `&before=${before}` : ""}`;
  const response = await withAuth((token) =>
    request<HistoryResponse>(`/api/conversations/with/${userId}/messages?${query}`, { token }),
  );
  if (!isSignedIn()) return;
  messageStore.setHistory(
    userId,
    response.data.map(toChatMessage),
    response.hasMore,
    Boolean(before),
  );
};

/** Sends one message. Resolves with the server's copy; throws ApiError on refusal. */
export const postMessage = async (userId: string, body: string): Promise<ChatMessage> => {
  const response = await withAuth((token) =>
    request<SendResponse>(`/api/conversations/with/${userId}/messages`, {
      method: "POST",
      body: { body },
      token,
    }),
  );
  return toChatMessage(response.data);
};

/** Marks a chat read on the server. Resolves with the new badge count. */
export const postRead = async (userId: string): Promise<number> => {
  const response = await withAuth((token) =>
    request<UnreadResponse>(`/api/conversations/with/${userId}/read`, { method: "POST", token }),
  );
  return response.unread;
};
