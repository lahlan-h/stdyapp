import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError, request } from "./api";
import { resetPosts } from "./postStore";
import {
  clearRefreshToken,
  loadRefreshToken,
  saveRefreshToken,
} from "./sessionStore";

/**
 * The signed-in session, and the app's only source of an access token.
 *
 * Real credentials now: POST /api/auth/login exchanges an email-or-username and
 * a password for an access/refresh pair, and POST /api/auth/refresh rotates the
 * pair when the 15-minute access token runs out. The dev-only
 * /api/auth/dev-token, which used to be the app's ONLY way in, survives solely
 * behind the login screen's dev bypass (see devLogin).
 *
 * Memory first, and on disk only when asked. A session signed in with Remember
 * me ticked - or created by registering - keeps its REFRESH token in
 * sessionStore (secure storage on phones, localStorage on web), and the next
 * launch trades it for a fresh pair before the root layout decides between
 * login and the feed (see restoreSession). Anything else stays in memory, so a
 * fresh launch lands on login exactly as before.
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
  /**
   * Whether the refresh token outlives this launch. Carried through every
   * rotation, because a remembered session that stopped saving its NEW token
   * would restore from a dead one next launch.
   */
  remember: boolean;
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

/**
 * The one place the session changes - and therefore the one place it is
 * persisted, so no sign-in, rotation or sign-out can forget to. Storage is
 * fire-and-forget: a failed write costs remembering, never the sign-in.
 */
const setSession = (next: Session | null) => {
  session = next;
  listeners.forEach((listener) => listener());

  if (next?.refreshToken && next.remember) {
    saveRefreshToken(next.refreshToken).catch(() => {});
  } else {
    clearRefreshToken().catch(() => {});
  }
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
 *
 * `remember` is the login screen's Remember me: on, and the next launch skips
 * login; off, and this session ends with the app.
 */
export const login = async (
  identifier: string,
  password: string,
  remember: boolean,
): Promise<void> => {
  const response = await request<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: { identifier: identifier.trim(), password },
  });

  setSession({
    accessToken: response.data.accessToken,
    refreshToken: response.data.refreshToken,
    remember,
  });
};

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Creates an account and signs straight into it.
 *
 * The API answers a registration with the same token pair a login does, so a
 * new account needs no second round trip: the session is set here and the root
 * layout's guard moves the app to the feed, exactly as after login.
 *
 * Always remembered: there is no Remember me on the sign-up screen, and
 * creating an account on a device is as clear a "this is mine" as ticking one.
 *
 * Throws the ApiError untouched, like login - wording a 409 is the hook's job.
 * Names are sent only when there is something in them: the API rejects an
 * empty name rather than storing one, and leaving the key out is how a client
 * says "no name yet". The password is never trimmed, for the reason login gives.
 */
export const register = async ({
  email,
  username,
  password,
  firstName,
  lastName,
}: RegisterInput): Promise<void> => {
  const first = firstName?.trim();
  const last = lastName?.trim();

  const response = await request<TokenResponse>("/api/auth/register", {
    method: "POST",
    body: {
      email: email.trim(),
      username: username.trim(),
      password,
      ...(first ? { firstName: first } : {}),
      ...(last ? { lastName: last } : {}),
    },
  });

  setSession({
    accessToken: response.data.accessToken,
    refreshToken: response.data.refreshToken,
    remember: true,
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
  // Never remembered: there is no refresh token to keep, and a shared dev
  // account is the last thing that should survive a relaunch.
  setSession({ accessToken: await mintDevToken(), remember: false });
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
      setSession({ accessToken, remember: false });
      return accessToken;
    }

    const response = await request<TokenResponse>("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken: current.refreshToken },
    });

    // The OLD refresh token is dead the moment it is used, so a remembered
    // session must save this one - setSession does, because remember carries.
    setSession({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      remember: current.remember,
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

/**
 * Signs out - on this device and on the server.
 *
 * The local half happens first and cannot fail: the session and any
 * remembered token are gone, the feed cache is emptied so the next account
 * never sees this one's likes, and the root layout's guard returns to login.
 * The server half then revokes the refresh token, so a copy of it is worthless
 * too. That call is best-effort: POST /api/auth/logout is public and always
 * answers 204, and a network failure must not leave someone stuck signed in.
 */
export const logout = async (): Promise<void> => {
  const refreshToken = session?.refreshToken;

  setSession(null);
  resetPosts();

  if (!refreshToken) return;
  try {
    await request<void>("/api/auth/logout", {
      method: "POST",
      body: { refreshToken },
    });
  } catch {
    /* already signed out locally; the token expires on its own */
  }
};

/**
 * Whether the launch-time restore has finished, whatever its outcome.
 *
 * The root layout renders nothing until it has, so a remembered user goes
 * straight to the feed rather than seeing login flash first.
 */
let restored = false;

/**
 * Trades a remembered refresh token for a live session, once per launch.
 *
 * - No token: nothing to restore.
 * - Accepted: signed in, and the ROTATED token is saved in its place.
 * - 401: expired or revoked - forgotten, and the user logs in again.
 * - Anything else, a network failure above all: the token is KEPT. Being
 *   offline at launch says nothing about the session - the same rule refresh()
 *   follows - so this launch shows login and the next one online restores.
 */
const restoreSession = async (): Promise<void> => {
  try {
    const refreshToken = await loadRefreshToken();
    if (!refreshToken) return;

    const response = await request<TokenResponse>("/api/auth/refresh", {
      method: "POST",
      body: { refreshToken },
    });

    setSession({
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
      remember: true,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await clearRefreshToken();
    }
  } finally {
    restored = true;
    listeners.forEach((listener) => listener());
  }
};

restoreSession();

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
 * The root layout routes on this and nothing else: signing in - or a
 * remembered session restoring at launch - flips it and the guard opens the
 * app; signing out, or a refresh the server rejects, flips it back.
 */
export const useIsSignedIn = (): boolean =>
  useSyncExternalStore(subscribe, getSignedIn, getSignedIn);

const getRestored = () => restored;

/** Whether the launch-time restore has settled - see restoreSession. */
export const useSessionRestored = (): boolean =>
  useSyncExternalStore(subscribe, getRestored, getRestored);
