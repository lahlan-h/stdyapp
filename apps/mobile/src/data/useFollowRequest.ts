import { useCallback, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import * as notificationStore from "./notificationStore";

export interface FollowRequestState {
  /** Resolves true once accepted - the requester now follows the caller. */
  accept: (requesterId: string) => Promise<boolean>;
  /** Resolves true once declined. The requester is not told. */
  decline: (requesterId: string) => Promise<boolean>;
  isBusy: boolean;
  error?: string;
  reset: () => void;
}

/**
 * Answers a request to follow the signed-in (private) account - from the
 * request's notification, or from the requester's profile.
 *
 * PESSIMISTIC, like useReportPost: the buttons show a spinner and nothing moves
 * until the server agrees, because an accept cannot be quietly undone - it
 * hands someone the account's posts.
 *
 * On success the request's notification is dropped from the list at once. The
 * server takes it back too and says so over the socket, but this device should
 * not wait on that; `remove` is a no-op for a row already gone.
 */
export const useFollowRequest = (): FollowRequestState => {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const inFlight = useRef(false);

  const answer = useCallback(async (requesterId: string, accept: boolean) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setIsBusy(true);
    setError(undefined);

    try {
      await withAuth((token) =>
        request<void>(
          accept
            ? `/api/follows/requests/${requesterId}/accept`
            : `/api/follows/requests/${requesterId}`,
          { method: accept ? "POST" : "DELETE", token },
        ),
      );
      dropRequestNotifications(requesterId);
      return true;
    } catch (err) {
      // Already answered elsewhere, or cancelled by the requester: the
      // notification is stale either way, so it goes too.
      if (err instanceof ApiError && err.status === 404) {
        dropRequestNotifications(requesterId);
        setError("That request is no longer waiting.");
      } else {
        setError(err instanceof ApiError ? err.message : "Could not answer that request. Try again.");
      }
      return false;
    } finally {
      inFlight.current = false;
      setIsBusy(false);
    }
  }, []);

  return {
    accept: useCallback((id: string) => answer(id, true), [answer]),
    decline: useCallback((id: string) => answer(id, false), [answer]),
    isBusy,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/** The FOLLOW_REQUEST rows this requester raised, out of the local list. */
const dropRequestNotifications = (requesterId: string) => {
  for (const notification of notificationStore.getSnapshot().items) {
    if (notification.type === "FOLLOW_REQUEST" && notification.actor?.id === requesterId) {
      notificationStore.remove(notification.id);
    }
  }
};
