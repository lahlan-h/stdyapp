import { useCallback, useEffect, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import { loadNotifications } from "./notificationApi";
import { startNotificationStream } from "./notificationSocket";
import * as notificationStore from "./notificationStore";
import type { AppNotification } from "./notificationMapping";

export interface NotificationsState {
  notifications: AppNotification[];
  /** What the badge shows. The API's count, kept live by the socket. */
  unread: number;
  /** True only until the first read lands. */
  isLoading: boolean;
  error?: string;
  /** Removes one, at once; puts it back if the server refuses. */
  remove: (id: string) => void;
  /** Removes all, at once; puts them back if the server refuses. */
  clearAll: () => void;
  /** Clears the badge - the page calls this when it opens. */
  markAllRead: () => void;
  reload: () => void;
}

const describe = (err: unknown, action: string): string => {
  if (err instanceof ApiError && err.status === 429) {
    return err.retryAfter
      ? `Too many ${action}. Try again in ${err.retryAfter}s.`
      : `Too many ${action}. Try again shortly.`;
  }
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
};

/**
 * The signed-in user's notifications, live.
 *
 * Reads the shared store, so the badge on the Home panel and the notifications
 * page always agree, and every change the socket delivers reaches both. The
 * list is read on first use; after that the socket keeps it current.
 *
 * Remove and clear are OPTIMISTIC, like a like: the row goes the moment it is
 * tapped, and comes back with an explanation only if the server says no. That
 * matters most for Clear all, which sits on the API's tightest limit - five an
 * hour - and is the one write here likely to be refused.
 */
export const useNotifications = (): NotificationsState => {
  const state = notificationStore.useNotificationState();
  const [error, setError] = useState<string | undefined>(undefined);

  const reload = useCallback(() => {
    loadNotifications()
      .then(() => setError(undefined))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load notifications."));
  }, []);

  // The socket's own connect also reads the list; this covers the first frame,
  // and an API too old to have the socket at all.
  useEffect(() => {
    if (!notificationStore.getSnapshot().loaded) reload();
  }, [reload]);

  const remove = useCallback((id: string) => {
    const before = notificationStore.getSnapshot();
    notificationStore.remove(id);
    setError(undefined);
    withAuth((token) =>
      request<void>(`/api/notifications/${id}`, { method: "DELETE", token }),
    ).catch((err) => {
      // Already gone - removed on another device, say. That is the state asked for.
      if (err instanceof ApiError && err.status === 404) return;
      notificationStore.restore(before);
      setError(describe(err, "changes"));
    });
  }, []);

  const clearAll = useCallback(() => {
    const before = notificationStore.getSnapshot();
    notificationStore.clear();
    setError(undefined);
    withAuth((token) =>
      request<unknown>("/api/notifications", { method: "DELETE", token }),
    ).catch((err) => {
      notificationStore.restore(before);
      setError(describe(err, "clears"));
    });
  }, []);

  const markAllRead = useCallback(() => {
    const before = notificationStore.getSnapshot();
    if (before.unread === 0 && before.items.every((item) => item.isRead)) return;
    notificationStore.markAllRead();
    withAuth((token) =>
      request<unknown>("/api/notifications/read-all", { method: "POST", token }),
    ).catch(() => {
      // Quietly: a badge that comes back is its own explanation.
      notificationStore.restore(before);
    });
  }, []);

  return {
    notifications: state.items,
    unread: state.unread,
    isLoading: !state.loaded && !error,
    error,
    remove,
    clearAll,
    markAllRead,
    reload,
  };
};

/**
 * Keeps the real-time connection open while this is mounted. Mounted once, by
 * the tab layout, so notifications arrive wherever in the app someone is.
 */
export const useNotificationStream = (): void => {
  useEffect(() => startNotificationStream(), []);
};
