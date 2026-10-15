import { useCallback, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";

export interface DiscardSessionState {
  /** Resolves true once the session is gone - including when it already was. */
  discard: (sessionId: string) => Promise<boolean>;
  isDiscarding: boolean;
  error?: string;
}

/**
 * Deletes a finished session - the composer's Discard.
 *
 * A finished session is posted or thrown away, the way Hevy saves or discards
 * a workout, so leaving the composer without posting deletes the session
 * rather than keeping it unposted.
 *
 * Deleting a session the server has already lost counts as success: "gone" is
 * what was asked for, and refusing to close the screen over it would trap the
 * user on it.
 */
export const useDiscardSession = (): DiscardSessionState => {
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const discard = useCallback(async (sessionId: string) => {
    setIsDiscarding(true);
    setError(undefined);
    try {
      await withAuth((token) =>
        request(`/api/sessions/${sessionId}`, { method: "DELETE", token }),
      );
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return true;
      setError(
        err instanceof ApiError ? err.message : "Could not discard the session. Try again.",
      );
      return false;
    } finally {
      setIsDiscarding(false);
    }
  }, []);

  return { discard, isDiscarding, error };
};
