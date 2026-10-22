import { useCallback, useState } from "react";
import * as Google from "expo-auth-session/providers/google";

import {
  ANDROID_CLIENT_ID,
  GOOGLE_CONFIGURED,
  IOS_CLIENT_ID,
  WEB_CLIENT_ID,
} from "./useGoogleSignIn";

export interface GoogleIdTokenState {
  /**
   * Opens Google's sign-in and resolves the ID token it hands back, or null
   * when the user closed the window or it failed - `error` says which.
   */
  requestIdToken: () => Promise<string | null>;
  /** From the Google prompt opening until it answers. */
  isPrompting: boolean;
  error?: string;
  reset: () => void;
}

const FAILED = "Google sign-in failed. Try again.";

/**
 * A Google ID token, WITHOUT signing in with it.
 *
 * useGoogleSignIn's prompt, for the one place the app needs Google to vouch for
 * someone who is already signed in: deleting an account that Google created,
 * whose password nobody was ever told. The token goes to the API as proof and
 * nothing else - no session changes here.
 *
 * Reads promptAsync's own result rather than the hook's `response`, as
 * useGoogleSignIn does: the caller wants the token where it asked for it, and
 * a promise hands it straight back.
 */
const useConfiguredGoogleIdToken = (): GoogleIdTokenState => {
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
  });

  const [isPrompting, setIsPrompting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const requestIdToken = useCallback(async (): Promise<string | null> => {
    // Built asynchronously on mount, as in useGoogleSignIn.
    if (!request) return null;

    setError(undefined);
    setIsPrompting(true);
    try {
      const result = await promptAsync();
      if (result.type !== "success") {
        // "cancel" and "dismiss" are the user closing Google's window.
        if (result.type === "error") setError(FAILED);
        return null;
      }
      const idToken = result.params.id_token;
      if (!idToken) setError(FAILED);
      return idToken || null;
    } catch {
      setError(FAILED);
      return null;
    } finally {
      setIsPrompting(false);
    }
  }, [request, promptAsync]);

  return {
    requestIdToken,
    isPrompting,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/** The same answer useGoogleSignIn gives on a build with no client ID. */
const useUnconfiguredGoogleIdToken = (): GoogleIdTokenState => {
  const [error, setError] = useState<string | undefined>(undefined);

  return {
    requestIdToken: useCallback(async () => {
      setError("Google sign-in isn't set up yet.");
      return null;
    }, []),
    isPrompting: false,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/** Chosen once, at module load - see useGoogleSignIn for why. */
export const useGoogleIdToken: () => GoogleIdTokenState = GOOGLE_CONFIGURED
  ? useConfiguredGoogleIdToken
  : useUnconfiguredGoogleIdToken;
