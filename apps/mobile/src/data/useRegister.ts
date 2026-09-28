import { useCallback, useState } from "react";

import { ApiError } from "./api";
import { register as signUp, type RegisterInput } from "./auth";

export interface RegisterState {
  /** Resolves true on success. On false, `error` is already set and on screen. */
  register: (input: RegisterInput) => Promise<boolean>;
  isSubmitting: boolean;
  error?: string;
  reset: () => void;
}

/**
 * Creates an account, and says what went wrong when it cannot.
 *
 * No navigation, for the reason useLogin gives: a successful registration
 * signs in, and the root layout's guard moves to the feed on its own.
 *
 * Every ApiError is shown in the server's own words - deliberately unlike
 * login's single message:
 *
 * - 409 already names the field ("Email is already in use" / "Username is
 *   already in use", from prismaError.js). Hiding which one would protect
 *   nothing - the API has said it - and would leave the user guessing which
 *   field to change.
 * - 400 arrives from api.ts as "field: message", which points at the fix.
 * - 0 carries api.ts's "cannot reach the server" text, which names the fix
 *   too, and 429 carries the rate limiter's own wording.
 */
export const useRegister = (): RegisterState => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const register = useCallback(async (input: RegisterInput) => {
    setIsSubmitting(true);
    setError(undefined);

    try {
      await signUp(input);
      return true;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create your account. Try again.",
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    register,
    isSubmitting,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};
