import { useCallback, useRef, useState } from "react";

import { ApiError, request } from "./api";

/** The verification code's length: six characters, A-Z and 0-9. */
export const RESET_CODE_LENGTH = 6;

/** Anything a code can never contain. */
const NOT_CODE_CHARACTER = /[^A-Z0-9]/g;

/**
 * What the user typed (or pasted, or the OS autofilled), as a code: uppercased,
 * stripped of everything that is not a letter or a digit, and capped at six.
 */
export const normalizeResetCode = (value: string): string =>
  value
    .toUpperCase()
    .replace(NOT_CODE_CHARACTER, "")
    .slice(0, RESET_CODE_LENGTH);

export interface ForgotPasswordState {
  /** Resolves true once a code is on its way. On false, `error` is set. */
  requestCode: (email: string) => Promise<boolean>;
  /** Resolves true when the code is accepted. On false, `error` is set. */
  verifyCode: (email: string, code: string) => Promise<boolean>;
  /**
   * Sets the new password, using the reset token the last accepted code
   * earned. Resolves true once it is changed. On false, `error` is set.
   */
  resetPassword: (password: string) => Promise<boolean>;
  isSubmitting: boolean;
  error?: string;
  reset: () => void;
}

interface VerifyResponse {
  data: { resetToken: string; expiresAt: string };
}

type Step = "request" | "verify" | "reset";

/**
 * Forgot password against the API's three public endpoints:
 *
 *   POST /api/auth/forgot-password   { email }            -> 204
 *   POST /api/auth/verify-reset-code { email, code }      -> { resetToken }
 *   POST /api/auth/reset-password    { resetToken, password } -> 204
 *
 * No access token on any of them - nobody asking is signed in. The reset token
 * stays in here, in a ref, rather than going back to the screen: it is a
 * credential, and the screen has no use for it beyond handing it straight back.
 *
 * There is no navigation and no sign-in. A reset signs the account out
 * everywhere, and the user logs in again with the new password.
 */
export const useForgotPassword = (): ForgotPasswordState => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const resetToken = useRef<string | null>(null);

  const run = useCallback(
    async (step: Step, call: () => Promise<void>) => {
      setIsSubmitting(true);
      setError(undefined);

      try {
        await call();
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError ? describe(step, err) : FALLBACK[step],
        );
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const requestCode = useCallback(
    (email: string) =>
      run("request", async () => {
        // A new code makes any token from an older one useless server-side.
        resetToken.current = null;
        await request<void>("/api/auth/forgot-password", {
          method: "POST",
          body: { email: email.trim() },
        });
      }),
    [run],
  );

  const verifyCode = useCallback(
    (email: string, code: string) =>
      run("verify", async () => {
        const response = await request<VerifyResponse>(
          "/api/auth/verify-reset-code",
          { method: "POST", body: { email: email.trim(), code } },
        );
        resetToken.current = response.data.resetToken;
      }),
    [run],
  );

  const resetPassword = useCallback(
    (password: string) =>
      run("reset", async () => {
        const token = resetToken.current;
        // Only reachable by a screen bug - the password step comes after a
        // verified code. Reported as the expiry it effectively is.
        if (!token) throw new ApiError(400, "No reset token");
        await request<void>("/api/auth/reset-password", {
          method: "POST",
          body: { resetToken: token, password },
        });
        resetToken.current = null;
      }),
    [run],
  );

  return {
    requestCode,
    verifyCode,
    resetPassword,
    isSubmitting,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

const FALLBACK: Record<Step, string> = {
  request: "Could not send a code. Try again.",
  verify: "Could not check the code. Try again.",
  reset: "Could not update your password. Try again.",
};

/**
 * One message for a wrong and an expired code, for useLogin's reason: telling
 * them apart helps whoever is guessing. The API makes the same choice, and
 * answers a request for an email with no account exactly as it answers one
 * with - so the screen has nothing to give away there either.
 */
const describe = (step: Step, err: ApiError): string => {
  switch (err.status) {
    case 400:
      if (step === "verify") return "That code is not right, or it has expired.";
      // A rejected password comes back as "password: ..." (see api.ts) and
      // says what to fix; any other 400 here is the token.
      if (step === "reset" && !err.message.startsWith("password")) {
        return "Your reset session expired. Request a new code.";
      }
      return err.message;
    case 429:
      return "Too many tries. Wait a moment and try again.";
    case 503:
      return "Password reset isn't available right now.";
    default:
      // Includes status 0, where api.ts has already written a message that
      // names the fix.
      return err.message;
  }
};
