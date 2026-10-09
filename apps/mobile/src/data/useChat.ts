import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "./api";
import { loadHistory, postMessage, postRead } from "./messageApi";
import * as messageStore from "./messageStore";
import type { ChatMessage } from "./messageMapping";
import type { UserSummary } from "./userSummary";

/**
 * How long after a message arrives in an open chat before it is marked read.
 * Short enough that the other device's badge clears at once; long enough that
 * a burst of three texts is one request, not three.
 */
const MARK_READ_DELAY_MS = 300;

export interface ChatHookState {
  /** Newest first - the order an inverted list draws bottom-up. */
  messages: ChatMessage[];
  /** True until the first page lands. */
  isLoading: boolean;
  hasMore: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => void;
  /** Sends at once and shows it straight away; see the note on useChat. */
  send: (body: string) => void;
  retry: (localId: string) => void;
  discard: (localId: string) => void;
  error?: string;
  reload: () => void;
}

const describe = (err: unknown): string => {
  if (err instanceof ApiError) {
    if (err.status === 404) return "This account isn't available to message.";
    if (err.status === 429) return "You're sending messages too quickly. Try again shortly.";
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
};

let localSeq = 0;
const nextLocalId = (): string => `local-${Date.now()}-${(localSeq += 1)}`;

/**
 * One open chat with one person.
 *
 * SENDING IS OPTIMISTIC: the bubble appears the moment send is tapped, marked
 * as sending, and becomes the real message when the server answers - or is
 * marked failed, with retry and discard, if it refuses. Waiting on a spinner
 * would make the most frequent action in a chat feel slow.
 *
 * READING IS AUTOMATIC: opening the chat marks it read, and so does every
 * message that arrives while it is open - the person is looking at it. While
 * open it is registered as the store's active chat, so incoming messages never
 * light the badge on their way to being read.
 */
export const useChat = (user: UserSummary): ChatHookState => {
  const state = messageStore.useMessageState();
  const chat = state.chats[user.id];
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  /**
   * Sends are not idempotent - two identical POSTs are two messages - so a
   * retry already in flight for one placeholder must not be fired again by a
   * second tap.
   */
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    messageStore.setActiveChat(user.id);
    return () => {
      if (messageStore.getActiveChat() === user.id) messageStore.setActiveChat(null);
    };
  }, [user.id]);

  const reload = useCallback(() => {
    setError(undefined);
    loadHistory(user.id).catch((err) => setError(describe(err)));
  }, [user.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  // The newest message from THEM. Changing is the signal that there is
  // something new to read - on open, once history lands, and on each arrival.
  const latestIncoming = chat?.messages.find((message) => !message.isMine)?.id;

  useEffect(() => {
    if (!latestIncoming) return;
    const timer = setTimeout(() => {
      messageStore.markReadLocal(user.id);
      postRead(user.id)
        .then((unread) => messageStore.setUnread(unread))
        .catch(() => {
          /* the next list read corrects the badge */
        });
    }, MARK_READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [user.id, latestIncoming]);

  const deliver = useCallback(
    (localId: string, body: string) => {
      if (inFlight.current.has(localId)) return;
      inFlight.current.add(localId);
      setError(undefined);
      postMessage(user.id, body)
        .then((message) => messageStore.resolvePending(user, localId, message))
        .catch((err) => {
          messageStore.failPending(user.id, localId);
          setError(describe(err));
        })
        .finally(() => inFlight.current.delete(localId));
    },
    [user],
  );

  const send = useCallback(
    (body: string) => {
      const text = body.trim();
      if (!text) return;
      const localId = nextLocalId();
      messageStore.addPending(user.id, {
        id: localId,
        body: text,
        createdAt: Date.now(),
        isMine: true,
        status: "sending",
      });
      deliver(localId, text);
    },
    [user.id, deliver],
  );

  const retry = useCallback(
    (localId: string) => {
      const message = messageStore
        .getSnapshot()
        .chats[user.id]?.messages.find((held) => held.id === localId);
      if (!message || message.status !== "failed") return;
      messageStore.markSending(user.id, localId);
      deliver(localId, message.body);
    },
    [user.id, deliver],
  );

  const discard = useCallback(
    (localId: string) => messageStore.discardMessage(user.id, localId),
    [user.id],
  );

  const loadOlder = useCallback(() => {
    const held = messageStore.getSnapshot().chats[user.id];
    if (!held?.hasMore || isLoadingOlder) return;
    // The oldest message the SERVER has - placeholders are only ever newest.
    const oldest = [...held.messages].reverse().find((message) => !message.status);
    if (!oldest) return;
    setIsLoadingOlder(true);
    loadHistory(user.id, oldest.id)
      .catch((err) => setError(describe(err)))
      .finally(() => setIsLoadingOlder(false));
  }, [user.id, isLoadingOlder]);

  return {
    messages: chat?.messages ?? [],
    isLoading: !chat?.loaded && !error,
    hasMore: chat?.hasMore ?? false,
    isLoadingOlder,
    loadOlder,
    send,
    retry,
    discard,
    error,
    reload,
  };
};
