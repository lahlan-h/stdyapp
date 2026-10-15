import { useCallback, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";

export interface SessionRatingState {
  /** The rating given here, or null before one is. */
  rating: number | null;
  rate: (value: number) => void;
  /** Set when the server refused the last rating, which has been rolled back. */
  error?: string;
}

/**
 * The self-rating for one finished session - "how focused did you feel?".
 *
 * It was asked on the Study tab's recap, through the live session's own hook.
 * Ending a session opens the composer now, and the composer sits on the root
 * stack, out of reach of that hook's provider - so the request is made here,
 * by session id, instead.
 *
 * Optimistic, as the recap's was: one tap, applied at once, rolled back with
 * the server's reason if it refuses.
 */
export const useSessionRating = (sessionId: string | undefined): SessionRatingState => {
  const [rating, setRating] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const rate = useCallback(
    (value: number) => {
      if (!sessionId) return;
      const previous = rating;
      setRating(value);
      setError(undefined);

      void (async () => {
        try {
          await withAuth((token) =>
            request(`/api/sessions/${sessionId}/focus-rating`, {
              method: "PUT",
              token,
              body: { selfRating: value },
            }),
          );
        } catch (err) {
          setRating(previous);
          setError(err instanceof ApiError ? err.message : "Could not save your rating.");
        }
      })();
    },
    [sessionId, rating],
  );

  return { rating, rate, error };
};
