import { useSyncExternalStore } from "react";

import type { AppNotification } from "./notificationMapping";

/**
 * The signed-in user's notifications and unread count, shared by everything
 * that shows them.
 *
 * Module state behind useSyncExternalStore, the postStore pattern, and for the
 * same reason: two writers that are not components feed it - the REST reads in
 * useNotifications and the socket in notificationSocket - while the badge and
 * the notifications page read it. A context would have to be mounted above
 * both; this is simply imported.
 *
 * The unread count is held, not derived. The list is the first page only, so
 * counting its unread rows would cap the badge at the page size; the API's own
 * count arrives with every socket connection and is kept in step by each event.
 */
export interface NotificationState {
  items: AppNotification[];
  unread: number;
  /** False until the first read lands, so the page can tell "empty" from "not yet". */
  loaded: boolean;
}

const EMPTY: NotificationState = { items: [], unread: 0, loaded: false };

let state: NotificationState = EMPTY;
const listeners = new Set<() => void>();

/** Replaced, never mutated in place - useSyncExternalStore compares by identity. */
const commit = (next: NotificationState): void => {
  state = next;
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getSnapshot = (): NotificationState => state;

export const useNotificationState = (): NotificationState =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** A fresh first page from the API, with the API's own unread count. */
export const setAll = (items: AppNotification[], unread: number): void => {
  commit({ items, unread, loaded: true });
};

export const setUnread = (unread: number): void => {
  if (state.unread === unread) return;
  commit({ ...state, unread });
};

/**
 * A notification that just arrived. Newest first, and a no-op for one already
 * held - the socket's event and a reconnect's refetch can both deliver it.
 */
export const add = (notification: AppNotification): void => {
  if (state.items.some((item) => item.id === notification.id)) return;
  commit({
    items: [notification, ...state.items],
    unread: state.unread + (notification.isRead ? 0 : 1),
    loaded: state.loaded,
  });
};

export const remove = (id: string): void => {
  const target = state.items.find((item) => item.id === id);
  if (!target) return;
  commit({
    ...state,
    items: state.items.filter((item) => item.id !== id),
    unread: Math.max(0, state.unread - (target.isRead ? 0 : 1)),
  });
};

/**
 * Empties the list. The unread count goes to zero with it: clearing deletes
 * every row on the server, read or not, so there is nothing left to count.
 */
export const clear = (): void => {
  if (state.items.length === 0 && state.unread === 0) return;
  commit({ ...state, items: [], unread: 0 });
};

export const markRead = (id: string): void => {
  const target = state.items.find((item) => item.id === id);
  if (!target || target.isRead) return;
  commit({
    ...state,
    items: state.items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    unread: Math.max(0, state.unread - 1),
  });
};

export const markAllRead = (): void => {
  if (state.unread === 0 && state.items.every((item) => item.isRead)) return;
  commit({
    ...state,
    items: state.items.map((item) => (item.isRead ? item : { ...item, isRead: true })),
    unread: 0,
  });
};

/** Puts back a snapshot taken before an optimistic change that the server refused. */
export const restore = (snapshot: NotificationState): void => {
  commit(snapshot);
};

/**
 * Empties the store on sign-out, for postStore's reason: the next account to
 * sign in on this phone must not see the last one's notifications, even for the
 * frame before its own first read lands.
 */
export const resetNotifications = (): void => {
  if (state !== EMPTY) commit(EMPTY);
};
