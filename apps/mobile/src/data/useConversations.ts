import { useCallback, useEffect, useState } from "react";

import { loadConversations } from "./messageApi";
import * as messageStore from "./messageStore";
import type { ConversationSummary } from "./messageMapping";

export interface ConversationsState {
  conversations: ConversationSummary[];
  /** People with unread messages - the Home panel's badge. Live over the socket. */
  unread: number;
  /** True only until the first read lands. */
  isLoading: boolean;
  error?: string;
  reload: () => void;
}

/**
 * The signed-in user's conversations and the badge, live.
 *
 * Reads the shared store, so the Home badge and the list agree, and every
 * message the socket delivers reaches both. Read on first use; after that the
 * socket keeps it current and re-reads it on every reconnect.
 */
export const useConversations = (): ConversationsState => {
  const state = messageStore.useMessageState();
  const [error, setError] = useState<string | undefined>(undefined);

  const reload = useCallback(() => {
    loadConversations()
      .then(() => setError(undefined))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load your messages."),
      );
  }, []);

  useEffect(() => {
    if (!messageStore.getSnapshot().loaded) reload();
  }, [reload]);

  return {
    conversations: state.conversations,
    unread: state.unread,
    isLoading: !state.loaded && !error,
    error,
    reload,
  };
};
