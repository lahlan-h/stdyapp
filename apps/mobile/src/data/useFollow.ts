import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import type { FollowSummary } from "./useFollowCounts";

export interface FollowState {
  /** Undefined until the follow summary has loaded, so the button can wait. */
  isFollowing?: boolean;
  isBusy: boolean;
  error?: string;
  toggle: () => void;
}

const describe = (err: unknown): string => {
  if (err instanceof ApiError) {
    // A block in either direction: the API answers 404 to the blocked side on
    // purpose, so "not found" here means "you cannot follow this person".
    if (err.status === 404) return "You can't follow this account.";
    if (err.status === 429) return "Too many changes. Try again shortly.";
    return err.message;
  }
  return "Could not update your follow. Try again.";
};

/**
 * Follow or unfollow one user.
 *
 * The starting answer is followedByMe from the summary useFollowCounts already
 * read - there is no separate "am I following" route, and a second request for
 * a fact already on screen would be waste.
 *
 * OPTIMISTIC, unlike useProfile's save: the button flips the moment it is
 * tapped and flips back if the server refuses. A follow is cheap to undo and
 * frequent to tap, so waiting on a spinner would make the commonest action on
 * the screen feel slow. `onSettled` re-reads the counts afterwards, so the
 * follower number reflects the server rather than a guess.
 *
 * Both writes are idempotent on the API - following twice is a 200, unfollowing
 * a stranger a 204 - so a double tap racing itself cannot corrupt anything.
 */
export const useFollow = (
  userId: string,
  summary: FollowSummary | undefined,
  onSettled: () => void,
): FollowState => {
  const [isFollowing, setIsFollowing] = useState<boolean | undefined>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /**
   * The summary that was current when the last write began.
   *
   * It describes the world BEFORE the tap, so adopting it - which would happen
   * the instant isBusy clears, before onSettled's re-read lands - would flick the
   * button back for a frame. Only a newer summary object is the server's answer.
   */
  const superseded = useRef<FollowSummary | undefined>(undefined);

  useEffect(() => {
    if (!summary || isBusy || summary === superseded.current) return;
    setIsFollowing(summary.followedByMe);
  }, [summary, isBusy]);

  const toggle = useCallback(async () => {
    if (isFollowing === undefined || isBusy) return;

    const next = !isFollowing;
    superseded.current = summary;
    setIsFollowing(next);
    setIsBusy(true);
    setError(undefined);

    try {
      await withAuth((token) =>
        next
          ? request<unknown>("/api/follows", {
              method: "POST",
              body: { followingId: userId },
              token,
            })
          : request<void>(`/api/follows/user/${userId}`, {
              method: "DELETE",
              token,
            }),
      );
    } catch (err) {
      setIsFollowing(!next);
      setError(describe(err));
    } finally {
      setIsBusy(false);
      onSettled();
    }
  }, [isFollowing, isBusy, summary, userId, onSettled]);

  return { isFollowing, isBusy, error, toggle };
};
