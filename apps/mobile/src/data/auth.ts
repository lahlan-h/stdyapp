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
