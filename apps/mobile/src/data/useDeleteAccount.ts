import { useCallback, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { clearLocalSession, withAuth } from "./auth";

/**
 * What proves the account is the caller's own: its password, or - for an
 * account Google created, whose password nobody knows - a fresh Google sign-in.
 * Exactly one, as the API's deleteUserSchema requires.
 */
export type DeleteAccountProof = { password: string } | { googleIdToken: string };

export interface DeleteAccountState {
  /**
   * Deletes the account. Resolves true once it is gone and this device is
   * signed out; false when it was refused, with `error` saying why.
   */
  deleteAccount: (userId: string, proof: DeleteAccountProof) => Promise<boolean>;
  isDeleting: boolean;
  error?: string;
  reset: () => void;
}

/**
 * Deletes the signed-in account, and everything in it.
 *
 * PESSIMISTIC, like useReportPost: the dialog shows a spinner, and nothing on
 * this device changes until the server has agreed - least of all the session,
 * since a refused delete must leave the user exactly where they were.
 *
 * On success only the LOCAL half of signing out runs. The server deleted every
 * token the account had along with it, so there is nothing to revoke, and the
 * root layout's guard moves to login the moment the session is gone - the same
 * way it does after Sign out.
 */
export const useDeleteAccount = (): DeleteAccountState => {
  const [error, setError] = useState<string | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState(false);

  // A ref, for useReportPost's reason: two taps in one frame must not send two
  // deletes, and batched state would let the second through.
  const inFlight = useRef(false);

  const deleteAccount = useCallback(
    async (userId: string, proof: DeleteAccountProof) => {
      if (inFlight.current) return false;

      inFlight.current = true;
      setError(undefined);
      setIsDeleting(true);

      try {
        await withAuth((token) =>
          request<void>(`/api/users/${userId}`, {
            method: "DELETE",
            body: proof,
            token,
          }),
        );
      } catch (err) {
        setError(describe(err));
        inFlight.current = false;
        setIsDeleting(false);
        return false;
      }

      // Not reset on success: the screen this hook belongs to is about to be
      // unmounted by the guard, and a re-enabled button would invite a second
      // tap at an account that no longer exists.
      await clearLocalSession();
      return true;
    },
    [],
  );

  return {
    deleteAccount,
    isDeleting,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/**
 * 403 falls through to the server's own sentence - "Incorrect password", or
 * which Google account was the wrong one - which is already written for the
 * person reading it. So does 502, whose sentence says nothing was deleted.
 */
const describe = (err: unknown): string => {
  if (!(err instanceof ApiError)) {
    return "Could not delete your account. Try again.";
  }

  switch (err.status) {
    case 429:
      return err.retryAfter
        ? `Too many attempts. Try again in ${err.retryAfter}s.`
        : "Too many attempts. Try again later.";
    case 503:
      return "Google sign-in isn't set up on the server. Use your password instead.";
    default:
      // Includes status 0, whose message already names the fix.
      return err.message;
  }
};
