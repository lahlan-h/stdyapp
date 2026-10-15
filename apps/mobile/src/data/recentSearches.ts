import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { UserSummary } from "./useUserSearch";

/**
 * The people this device opened from search, newest first.
 *
 * Module state behind useSyncExternalStore, the pattern postStore uses: the
 * search page reads it, and it is written from a row tap that closes that page,
 * so the list has to outlive any one component. AsyncStorage keeps it across
 * launches.
 *
 * Stored as the summary rather than an id, so the list renders instantly and
 * offline. A name or avatar can go stale until the person is opened again,
 * which re-saves them - a trade worth it for a list whose job is speed.
 */
const STORAGE_KEY = "recentSearches";

/** Enough to be useful, few enough to scan. */
const MAX_RECENTS = 10;

let recents: UserSummary[] = [];
const listeners = new Set<() => void>();

const commit = (next: UserSummary[]): void => {
  recents = next;
  listeners.forEach((listener) => listener());
  // Fire-and-forget: a failed write costs the list on the next launch, never
  // the one on screen, so it is not worth surfacing.
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
};

/**
 * Read once per launch.
 *
 * `recents.length === 0` guards the race where a tap lands before the read: the
 * fresh entry is newer than anything stored, so it must not be overwritten.
 */
AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    if (!stored || recents.length > 0) return;
    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      recents = parsed as UserSummary[];
      listeners.forEach((listener) => listener());
    }
  })
  .catch(() => {});

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): UserSummary[] => recents;

/** Moves a person to the top, adding them if new and dropping the oldest past the cap. */
export const addRecentSearch = (user: UserSummary): void => {
  commit([user, ...recents.filter((entry) => entry.id !== user.id)].slice(0, MAX_RECENTS));
};

export const removeRecentSearch = (userId: string): void => {
  if (!recents.some((entry) => entry.id === userId)) return;
  commit(recents.filter((entry) => entry.id !== userId));
};

/**
 * Empties the list. Also called by logout(): who someone looked up is theirs,
 * and the next account to sign in on this phone must not inherit it.
 */
export const clearRecentSearches = (): void => {
  if (recents.length === 0) {
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    return;
  }
  recents = [];
  listeners.forEach((listener) => listener());
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
};

export interface RecentSearchesState {
  recents: UserSummary[];
  add: (user: UserSummary) => void;
  remove: (userId: string) => void;
  clear: () => void;
}

export const useRecentSearches = (): RecentSearchesState => ({
  recents: useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
  add: addRecentSearch,
  remove: removeRecentSearch,
  clear: clearRecentSearches,
});
