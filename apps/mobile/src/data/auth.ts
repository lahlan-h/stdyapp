import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError, request } from "./api";

const STORAGE_KEY = "accessToken";

interface DevTokenResponse {
  data: {
    user: { id: string; username: string };
    accessToken: string;
    tokenType: string;
  };
}

/**
 * The app's only source of an access token, and deliberately the only one.
 *
 * There is no sign-in yet. This mints a token from POST /api/auth/dev-token,
 * which the API mounts ONLY when NODE_ENV=development and which takes no
 * credentials at all - every caller shares one `dev_local` account. That is
 * fine for building against a local API and is not auth: it cannot work
 * against a deployed server, and it must not be the reason a login screen
 * never gets written.
 *
 * It lives behind one function so that when real auth lands, the login and
 * refresh flow replaces the body of this file and no screen changes.
 */
let inFlight: Promise<string> | null = null;

const mintToken = async (): Promise<string> => {
  const response = await request<DevTokenResponse>("/api/auth/dev-token", {
    method: "POST",
  });

  const token = response.data.accessToken;
  // Fire and forget: a token we cannot cache still works for this session.
  AsyncStorage.setItem(STORAGE_KEY, token).catch(() => {});

  return token;
};

/**
 * Callers share one mint rather than racing.
 *
 * The screen can easily ask for a token twice in a tick - the feed loading
 * while a post is submitted - and two mints would leave whichever wrote last
 * in storage while the other caller holds a token nobody remembers.
 */
const mintOnce = (): Promise<string> => {
  if (!inFlight) {
    inFlight = mintToken().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};

/** A cached token if there is one, otherwise a freshly minted one. */
export const getAccessToken = async (): Promise<string> => {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* storage unavailable - mint a fresh one rather than failing the call */
  }

  return mintOnce();
};

/** Drops the cached token so the next call mints a new one. */
export const clearAccessToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do: the next 401 will mint again anyway */
  }
};

/**
 * Runs an authenticated call, re-minting once if the token has expired.
 *
 * Access tokens last 15 minutes, so a cached one is expired more often than
 * not - the app sits idle far longer than that between posts. Retrying on 401
 * is what stops the first action after a break from failing for a reason the
 * user cannot act on. Retried exactly once: a second 401 is a real failure.
 */
export const withAuth = async <T>(
  call: (token: string) => Promise<T>,
): Promise<T> => {
  const token = await getAccessToken();

  try {
    return await call(token);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;

    await clearAccessToken();
    return call(await mintOnce());
  }
};

// --- Sign-out ---------------------------------------------------------------

/**
 * Where the refresh token is expected to live once the login flow stores one.
 *
 * Nothing writes it yet: POST /api/auth/dev-token issues no refresh token, and
 * the login flow that will is being built separately. Named here, beside the
 * access token's key, so both flows agree on it.
 */
export const REFRESH_TOKEN_STORAGE_KEY = "refreshToken";

const signOutListeners = new Set<() => void>();

/**
 * Runs `listener` after every sign-out. Returns the unsubscribe.
 *
 * Sign-out does not navigate, because this layer has no idea what screen a
 * signed-out user should see. Whatever owns that - the auth flow's root
 * guard - subscribes here and makes the move.
 */
export const onSignOut = (listener: () => void): (() => void) => {
  signOutListeners.add(listener);
  return () => signOutListeners.delete(listener);
};

/**
 * Ends the session on this device.
 *
 * The tokens are removed FIRST and unconditionally, so signing out works with
 * no network. The server call only revokes the refresh token, and it is
 * best-effort: POST /api/auth/logout answers 204 whether or not the token
 * existed, so there is no failure to show the user.
 *
 * With only the dev token, there is no refresh token to revoke, so this clears
 * the access token and nothing else - and withAuth mints a new dev token on
 * the next request. That is the dev flow working as designed, not sign-out
 * failing; a real signed-out state arrives with the login flow.
 */
export const signOut = async (): Promise<void> => {
  let refreshToken: string | null = null;
  try {
    refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    /* unreadable storage means nothing to revoke */
  }

  try {
    await AsyncStorage.multiRemove([STORAGE_KEY, REFRESH_TOKEN_STORAGE_KEY]);
  } catch {
    /* nothing more to do: the tokens are unusable to this session anyway */
  }

  signOutListeners.forEach((listener) => listener());

  if (refreshToken) {
    await request<void>("/api/auth/logout", {
      method: "POST",
      body: { refreshToken },
    }).catch(() => {});
  }
};