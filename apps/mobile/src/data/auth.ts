import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError, request } from "./api";

/**
 * The signed-in session, and the app's only source of an access token.
 *
 * Real credentials now: POST /api/auth/login exchanges an email-or-username and
 * a password for an access/refresh pair, and POST /api/auth/refresh rotates the
 * pair when the 15-minute access token runs out. The dev-only
 * /api/auth/dev-token, which used to be the app's ONLY way in, survives solely
 * behind the login screen's dev bypass (see devLogin).
 *
 * MEMORY ONLY, deliberately. Nothing here touches storage, so every fresh
 * launch starts signed out and lands on the login screen - the behaviour that
 * was asked for. If the app later wants to stay signed in across launches,
 * persisting the refresh token is the whole change, and it belongs in secure
 * storage, not AsyncStorage.
 *
 * Screens never see tokens. Data hooks reach them only through withAuth(), which
 * is why swapping the dev mint for real login changed no hook at all.
 */

interface Session {
  accessToken: string;
  /**
   * Absent for a dev-bypass session. POST /api/auth/dev-token issues an access
   * token and nothing else, so there is nothing to rotate - refresh() re-mints
   * instead.
   */
  refreshToken?: string;
}

interface DevTokenResponse {
  data: {
    user: { id: string; username: string };
    accessToken: string;
    tokenType: string;
  };
}

interface TokenResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    refreshTokenExpiresAt: string;
  };
}

let session: Session | null = null;
const listeners = new Set<() => void>();

const setSession = (next: Session | null) => {
  session = next;
  listeners.forEach((listener) => listener());
};

/**
 * The dev token the previous implementation cached, removed once.
 *
 * Nothing reads this key any more, but it held a working credential for the
 * shared dev account, and leaving live tokens lying in storage on devices is
 * the kind of thing nobody remembers to clean up later.
 */
AsyncStorage.removeItem("accessToken").catch(() => {});

/**
 * Signs in with an email or username, and a password.
 *
 * Throws the ApiError untouched: turning a 401 into words the user sees is the
 * login hook's job, not this file's. The identifier is trimmed because a stray
 * space from autofill should not fail a login; the password is not, because a
 * space in a password is part of it.
 */
export const login = async (
  identifier: string,
  password: string,
): Promise<void> => {
  const response = await request<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: { identifier: identifier.trim(), password },
  });

  setSession({
    accessToken: response.data.accessToken,
    refreshToken: response.data.refreshToken,
  });
};

/** A fresh access token for the shared dev account. No credentials, no refresh token. */
const mintDevToken = async (): Promise<string> => {
  const response = await request<DevTokenResponse>("/api/auth/dev-token", {
    method: "POST",
  });
  return response.data.accessToken;
};

/**
 * Signs in as the shared `dev_local` account - the login screen's dev bypass.
 *
 * A development convenience and nothing more: the API mounts the route only
 * when NODE_ENV=development (anything else answers 404), and the screen only
 * renders the button in __DEV__ builds. Every caller shares the one account.
 */
export const devLogin = async (): Promise<void> => {
  setSession({ accessToken: await mintDevToken() });
};

/**
 * One refresh at a time, shared by every caller that needs it.
 *
 * NOT an optimisation. The API rotates the refresh token on every use and
 * treats a replayed one as stolen - it revokes every session the user has, on
 * every device. Two hooks refreshing at once would present the same token
 * twice, and the loser's retry would sign the user out everywhere.
 */
let inFlight: Promise<string> | null = null;

const refresh = async (): Promise<string> => {
  const current = session;
  if (!current) throw new ApiError(401, "Not signed in");

  try {
    // A dev session has no refresh token to present, so it re-mints - what the
    // app did on every 401 before real login existed.
    if (!current.refreshToken) {
      const accessToken = await mintDevToken();
      setSession({ accessToken });
      return accessToken;
    }

    const response = await request<TokenResponse>("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: current.refreshToken },
    });

    setSession({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
    });
    return response.data.accessToken;
  } catch (err) {
    // A refresh token the server will not honour means the session is over.
    // Clearing it is what sends the user back to the login screen: the root
    // layout's guard is watching.
    //
    // Only for a real rejection. A network failure says nothing about the
    // session, and signing someone out because their train went into a tunnel
    // would be worse than letting the call fail.
    //
    // 404 as well: that is the dev route answering from an API no longer in
    // development, and no retry will bring the session back.
    if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
      setSession(null);
    }
    throw err;
  }
};

const refreshOnce = (): Promise<string> => {
  if (!inFlight) {
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};

/**
 * Runs an authenticated call, refreshing once if the access token has expired.
 *
 * Access tokens last 15 minutes, far less than the app sits idle between
 * actions, so the first call after a break expires more often than not.
 * Retried exactly once: a second 401 is a real failure.
 */
export const withAuth = async <T>(
  call: (token: string) => Promise<T>,
): Promise<T> => {
  if (!session) throw new ApiError(401, "Not signed in");

  try {
    return await call(session.accessToken);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;

    return call(await refreshOnce());
  }
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSignedIn = () => session !== null;

/**
 * Whether anyone is signed in, re-rendering when that changes.
 *
 * The root layout routes on this and nothing else: signing in flips it and the
 * guard opens the app; a refresh the server rejects flips it back.
 */
export const useIsSignedIn = (): boolean =>
  useSyncExternalStore(subscribe, getSignedIn, getSignedIn);
