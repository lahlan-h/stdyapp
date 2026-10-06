import { useCallback, useEffect, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";

/**
 * GET /api/follows/user/:userId/count, as getFollowSummary answers it.
 *
 * followedByMe and followsMe are facts about the VIEWER, not the user being
 * read - the API works them out from the token. Nothing renders them yet; they
 * are kept on the type because the follow button a profile will need reads
 * followedByMe, and dropping them here would only mean adding them back.
 */
export interface FollowSummary {
  userId: string;
  followers: number;
  following: number;
  followedByMe: boolean;
  followsMe: boolean;
}

export interface FollowCountsState {
  summary?: FollowSummary;
  isLoading: boolean;
  error?: string;
  reload: () => void;
}

/**
 * How many follow this user, and how many they follow.
 *
 * Its own hook rather than part of useProfile: the counts come from a different
 * router, change without the profile changing, and are readable for ANY user
 * while GET /api/auth/me is only ever the caller. Folding them together would
 * mean a profile read that cannot answer for anyone else.
 *
 * @param userId - whose counts. Defaults to the caller's own.
 */
export const useFollowCounts = (userId: string = "me"): FollowCountsState => {
  const [summary, setSummary] = useState<FollowSummary | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await withAuth((token) =>
        request<FollowSummary>(`/api/follows/user/${userId}/count`, { token }),
      );
      setSummary(data);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load follows.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { summary, isLoading, error, reload: load };
};
