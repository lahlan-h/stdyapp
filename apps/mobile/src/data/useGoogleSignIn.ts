import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";

import { ApiError } from "./api";
import { googleSignIn } from "./auth";

/**
 * On web, Google answers into a popup that loads this app again. This call is
 * what lets that popup hand the result back to the window that opened it and
 * close itself - without it the popup just shows the app. A no-op on native.
 */
WebBrowser.maybeCompleteAuthSession();

export interface GoogleSignInState {
  /**
   * Opens Google's sign-in. `remember` decides whether the session outlives
   * this launch, exactly as for a password login.
   */
  signIn: (remember: boolean) => void;
  /** From the Google prompt opening until the API has answered. */
  isSubmitting: boolean;
  error?: string;
  reset: () => void;
}

/**
 * OAuth client IDs, one per platform, from Google Cloud Console. Public by
 * design - every Google-enabled app ships its client ID - so EXPO_PUBLIC_ is
 * right here, unlike for anything secret. There is no client secret in this
 * flow at all.
 */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;
const ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined;

/** Whether THIS platform has the client ID it needs. */
const GOOGLE_CONFIGURED = Boolean(
  Platform.select({
    web: WEB_CLIENT_ID,
    ios: IOS_CLIENT_ID,
    android: ANDROID_CLIENT_ID,
    default: undefined,
  }),
);

const FAILED = "Google sign-in failed. Try again.";

/**
 * The API's answer, in words. 401 covers every way the token can fail to
 * verify - the API deliberately does not say which - except an unverified
 * email, which it names and which is worth passing on as-is.
 */
const describe = (err: unknown): string => {
  if (!(err instanceof ApiError)) return FAILED;
  switch (err.status) {
    case 401:
      return err.message.includes("not verified") ? err.message : FAILED;
    case 503:
      return "Google sign-in isn't set up on the server yet.";
    default:
      // Includes status 0, whose message already names the fix.
      return err.message;
  }
};

/**
 * Google sign-in, wired to Google.
 *
 * Google hands back an ID token - a signed statement of who the user is - and
 * the API does the rest (see googleSignIn in auth.ts). No navigation here, for
 * the reason useLogin gives: a successful sign-in flips the session and the
 * root layout's guard moves to the feed.
 */
const useConfiguredGoogleSignIn = (): GoogleSignInState => {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // Read when Google answers, which is a later render than the tap.
  const remember = useRef(false);

  const signIn = useCallback(
    (shouldRemember: boolean) => {
      // The request is built asynchronously on mount; a tap in that first
      // instant simply does nothing rather than failing.
      if (!request) return;
      remember.current = shouldRemember;
      setError(undefined);
      setIsSubmitting(true);
      promptAsync().catch(() => {
        setError(FAILED);
        setIsSubmitting(false);
      });
    },
    [request, promptAsync],
  );

  useEffect(() => {
    if (!response) return;

    if (response.type !== "success") {
      // "cancel" and "dismiss" are the user closing Google's window - not an
      // error worth a red box. Anything else is.
      if (response.type === "error") setError(FAILED);
      setIsSubmitting(false);
      return;
    }

    const idToken = response.params.id_token;
    if (!idToken) {
      setError(FAILED);
      setIsSubmitting(false);
      return;
    }

    let cancelled = false;
    googleSignIn(idToken, remember.current)
      .catch((err) => {
        if (!cancelled) setError(describe(err));
      })
      .finally(() => {
        if (!cancelled) setIsSubmitting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [response]);

  return {
    signIn,
    isSubmitting,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/**
 * Google sign-in on a build with no client ID for its platform.
 *
 * The button still answers, with a message that says what is missing, rather
 * than opening a Google page that can only fail.
 */
const useUnconfiguredGoogleSignIn = (): GoogleSignInState => {
  const [error, setError] = useState<string | undefined>(undefined);

  return {
    signIn: useCallback(
      () => setError("Google sign-in isn't set up yet."),
      [],
    ),
    isSubmitting: false,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/**
 * Chosen once, at module load, and never again. The provider hook throws when
 * its platform's client ID is missing, so an unconfigured build must not call
 * it at all - and since the choice depends only on build-time values, every
 * render takes the same branch and the rules of hooks hold.
 */
export const useGoogleSignIn: () => GoogleSignInState = GOOGLE_CONFIGURED
  ? useConfiguredGoogleSignIn
  : useUnconfiguredGoogleSignIn;
