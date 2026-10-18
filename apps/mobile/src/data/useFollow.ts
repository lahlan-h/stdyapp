import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import type { FollowSummary } from "./useFollowCounts";

/**
 * Where the viewer stands with someone:
 *   none      - not following; the button offers Follow
 *   requested - asked to follow a private account, waiting on its answer
 *   following - an approved follower
 */
export type FollowStatus = "none" | "requested" | "following";

export interface FollowState {
  /** Undefined until the follow summary has loaded, so the button can wait. */
  status?: FollowStatus;
  isBusy: boolean;
  error?: string;
  toggle: () => void;
}

/** What POST /api/follows answers - a follow row, or a request still waiting. */
interface FollowResponse {
  status: "following" | "requested";
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

const statusOf = (summary: FollowSummary): FollowStatus =>
  summary.followedByMe ? "following" : summary.requestedByMe ? "requested" : "none";

/**
 * Follow, unfollow, or - for a private account - ask to follow, and take the
 * request back.
 *
 * The starting answer comes from the summary useFollowCounts already read -
 * there is no separate "am I following" route, and a second request for a fact
 * already on screen would be waste.
 *
 * OPTIMISTIC, unlike useProfile's save: the button changes the moment it is
 * tapped and changes back if the server refuses. A Follow tap guesses
 * "following" and is corrected to "requested" by the answer when the account
 * turns out to be private - the API, not this hook, knows which. `onSettled`
 * re-reads the summary afterwards, so the counts and canView reflect the server.
 *
 * Both writes are idempotent on the API - following or asking twice is fine,
 * and the DELETE both unfollows and cancels a request - so a double tap racing
 * itself cannot corrupt anything.
 */
export const useFollow = (
  userId: string,
  summary: FollowSummary | undefined,
  onSettled: () => void,
): FollowState => {
  const [status, setStatus] = useState<FollowStatus | undefined>(undefined);
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
    setStatus(statusOf(summary));
  }, [summary, isBusy]);

  const toggle = useCallback(async () => {
    if (status === undefined || isBusy) return;

    const before = status;
    // From none, a follow; from either other state, the DELETE that unfollows
    // or cancels the request.
    const isFollow = before === "none";
    superseded.current = summary;
    setStatus(isFollow ? "following" : "none");
    setIsBusy(true);
    setError(undefined);

    try {
      if (isFollow) {
        const answer = await withAuth((token) =>
          request<FollowResponse>("/api/follows", {
            method: "POST",
            body: { followingId: userId },
            token,
          }),
        );
        setStatus(answer?.status === "requested" ? "requested" : "following");
      } else {
        await withAuth((token) =>
          request<void>(`/api/follows/user/${userId}`, { method: "DELETE", token }),
        );
      }
    } catch (err) {
      setStatus(before);
      setError(describe(err));
    } finally {
      setIsBusy(false);
      onSettled();
    }
  }, [status, isBusy, summary, userId, onSettled]);

  return { status, isBusy, error, toggle };
};
