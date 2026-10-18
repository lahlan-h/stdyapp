import { useCallback, useEffect, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";

/**
 * GET /api/follows/user/:userId/count, as getFollowSummary answers it.
 *
 * Everything after the two counts is a fact about the VIEWER, not the user
 * being read - the API works it out from the token.
 */
export interface FollowSummary {
  userId: string;
  followers: number;
  following: number;
  followedByMe: boolean;
  followsMe: boolean;
  /** The viewer has asked to follow this private account and is waiting. */
  requestedByMe: boolean;
  /** This person has asked to follow the VIEWER - their profile offers Accept. */
  requestsMe: boolean;
  /**
   * Whether the viewer may see this account's posts and activity. False only
   * for a private account the viewer is not an approved follower of - the
   * profile then shows a lock where its posts would be.
   */
  canView: boolean;
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
