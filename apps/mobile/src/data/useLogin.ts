import { useCallback, useState } from "react";

import { ApiError } from "./api";
import { devLogin, login as signIn } from "./auth";

export interface LoginState {
  /** Resolves true on success. On false, `error` is already set and on screen. */
  login: (
    identifier: string,
    password: string,
    remember: boolean,
  ) => Promise<boolean>;
  /** Signs in as the shared dev account. Same contract as `login`. */
  devBypass: () => Promise<boolean>;
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

  const login = useCallback(
    async (identifier: string, password: string, remember: boolean) => {
      setIsSubmitting(true);
      setError(undefined);

      try {
        await signIn(identifier, password, remember);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? describe(err)
            : "Could not log in. Try again.",
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  // Shares isSubmitting and error with login, so the screen has one busy state
  // and one error box, whichever way in was tried.
  const devBypass = useCallback(async () => {
    setIsSubmitting(true);
    setError(undefined);

    try {
      await devLogin();
      return true;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? describeBypass(err)
          : "Dev bypass failed. Try again.",
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    login,
    devBypass,
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

/**
 * The bypass has its own failure modes, and none of them is a wrong password -
 * reusing the credentials message here would send someone hunting for a typo in
 * fields they never filled in.
 */
const describeBypass = (err: ApiError): string => {
  switch (err.status) {
    case 404:
      // The API only mounts /api/auth/dev-token when NODE_ENV=development.
      return "Dev bypass needs the API running with NODE_ENV=development.";
    default:
      return err.message;
  }
};
