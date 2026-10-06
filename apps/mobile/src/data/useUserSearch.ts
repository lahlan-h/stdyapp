import { useEffect, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import { toDisplayName } from "./feedMapping";
import type { FeedAuthor } from "./types";

/**
 * One person in a search result or the recent-searches list.
 *
 * The same shape a post card's author already has, on purpose: both are "a
 * person, named and pictured", and one type means a result row and a card
 * header can never disagree about how someone is shown.
 */
export type UserSummary = FeedAuthor;

/** How long typing must pause before a search goes out. */
const DEBOUNCE_MS = 300;

/** One screenful. The list is a lookup, not a directory, so there is no paging. */
const RESULT_LIMIT = 20;

/** One user as GET /api/users lists them - USER_SEARCH_SELECT on the API. */
export interface RawUser {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

interface SearchResponse {
  data: RawUser[];
}

export const toUserSummary = (user: RawUser): UserSummary => ({
  id: user.id,
  username: user.username,
  displayName: toDisplayName(user.firstName, user.lastName, user.username),
  avatarUrl: user.avatarUrl ?? undefined,
});

export interface UserSearchState {
  results: UserSummary[];
  /** True from the first keystroke until the answer for the latest query lands. */
  isSearching: boolean;
  error?: string;
}

const describe = (err: unknown): string => {
  if (err instanceof ApiError && err.status === 429) {
    return err.retryAfter
      ? `Searching too quickly. Try again in ${err.retryAfter}s.`
      : "Searching too quickly. Try again shortly.";
  }
  return err instanceof Error ? err.message : "Could not search right now.";
};

/**
 * People whose username or name contains `query`, as it is typed.
 *
 * DEBOUNCED, because every keystroke would otherwise be a request against a
 * rate-limited route: "alexander" is nine reads where one would do, and a fast
 * typist would spend the budget on prefixes nobody wanted to see.
 *
 * GENERATION-GUARDED for the same reason usePosts is: "al" and "ale" can both
 * be in flight, and whichever lands last would otherwise win - showing results
 * for a query the box no longer holds.
 *
 * An empty query asks for nothing and clears the results. The API would answer
 * it with every user, which is a directory, not a search.
 */
export const useUserSearch = (query: string): UserSearchState => {
  const [results, setResults] = useState<UserSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const generation = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    const ticket = ++generation.current;

    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      setError(undefined);
      return;
    }

    // Shown immediately rather than after the debounce, so the list says
    // "searching" the moment someone types instead of briefly claiming no match.
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const response = await withAuth((token) =>
          request<SearchResponse>(
            `/api/users?q=${encodeURIComponent(trimmed)}&limit=${RESULT_LIMIT}`,
            { token },
          ),
        );
        if (ticket !== generation.current) return;
        setResults(response.data.map(toUserSummary));
        setError(undefined);
      } catch (err) {
        if (ticket !== generation.current) return;
        setError(describe(err));
      } finally {
        if (ticket === generation.current) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed]);

  return { results, isSearching, error };
};
