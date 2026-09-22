import { useCallback, useState } from "react";

import { ApiError } from "./api";
import { login as signIn } from "./auth";

export interface LoginState {
  /** Resolves true on success. On false, `error` is already set and on screen. */
  login: (identifier: string, password: string) => Promise<boolean>;
  isSubmitting: boolean;
  error?: string;
  reset: () => void;
}

/**
 * Signs in, and says what went wrong when it does not.
 *
 * There is no navigation here. A successful login flips the session, and the
 * root layout's guard moves the app from the login screen to the feed on its
 * own - so the screen cannot forget to, and nothing else can sign in without
 * the same thing happening.
 */
export const useLogin = (): LoginState => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const login = useCallback(async (identifier: string, password: string) => {
    setIsSubmitting(true);
    setError(undefined);

    try {
      await signIn(identifier, password);
      return true;
    } catch (err) {
      setError(
        err instanceof ApiError ? describe(err) : "Could not log in. Try again.",
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    login,
    isSubmitting,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/**
 * ONE message for a wrong username and a wrong password, and it must stay one.
 *
 * Splitting it into "no such account" and "wrong password" tells whoever is
 * guessing which half they got right. The API answers every failed login with
 * the same 401 and spends the same bcrypt time on unknown users for exactly that
 * reason; the screen must not undo it by being helpful.
 *
 * 400 gets the same message. The button is disabled until both fields have
 * something in them, so a 400 here can only mean an overlong field - and
 * answering that differently would be a second, smaller version of the leak.
 */
const INVALID_CREDENTIALS = "Invalid email/username or password!";

const describe = (err: ApiError): string => {
  switch (err.status) {
    case 400:
    case 401:
      return INVALID_CREDENTIALS;
    default:
      // Includes status 0, where api.ts has already written a message that
      // names the fix ("check EXPO_PUBLIC_API_URL").
      return err.message;
  }
};
