import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError, request } from "./api";

/**
 * Who is signed in, and the only place that holds their tokens.
 *
 * Replaces the dev-token-only body this file used to have. The exported
 * withAuth keeps its old signature, so no hook that calls it had to change.
 *
 * Two kinds of session:
 *
 *  - "password": from POST /api/auth/login. Holds a refresh token, which is how
 *    an expired access token gets renewed and what sign-out revokes.
 *  - "dev": from POST /api/auth/dev-token. Access token only - the API issues
 *    no refresh token for it - so renewing it means minting again, and signing
 *    out has nothing on the server to revoke. Only offered when __DEV__.
 *
 * The whole session is one JSON value under one key, so a half-written sign-in
 * can never leave an access token next to someone else's refresh token.
 */
const STORAGE_KEY = "session";

/** What this file used to store. Removed on first launch, never read. */
const LEGACY_STORAGE_KEY = "accessToken";

type Session =
  | {
      kind: "password";
      userId: string;
      accessToken: string;
      refreshToken: string;
    }
  | { kind: "dev"; userId: string; accessToken: string };

export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; kind: Session["kind"] };

interface TokenPayload {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  refreshTokenExpiresAt: string;
}

interface LoginResponse {
  data: TokenPayload & { user: { id: string } };
}

interface RefreshResponse {
  data: TokenPayload;
}

interface DevTokenResponse {
  data: { user: { id: string }; accessToken: string; tokenType: string };
}

// --- Store ------------------------------------------------------------------

let session: Session | null = null;
let state: AuthState = { status: "loading" };
const listeners = new Set<() => void>();

/**
 * Bumped on every sign-in and sign-out.
 *
 * A refresh that is still in flight when the user signs out must not write its
 * new tokens back afterwards - that would sign them straight back in. Each
 * refresh remembers the generation it started in and drops its result if the
 * generation has moved on.
 */
let generation = 0;

/** Replaced, never mutated, for useSyncExternalStore's identity check. */
const commit = (next: Session | null): void => {
  session = next;
  state = next
    ? { status: "signedIn", userId: next.userId, kind: next.kind }
    : { status: "signedOut" };
  listeners.forEach((listener) => listener());
};

const persist = (next: Session | null): void => {
  const write = next
    ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    : AsyncStorage.removeItem(STORAGE_KEY);
  // Fire and forget: the in-memory session is already right for this launch.
  write.catch(() => {});
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = (): AuthState => state;

/** The current auth state. Re-renders when the user signs in or out. */
export const useAuth = (): AuthState => useSyncExternalStore(subscribe, getSnapshot);

/**
 * A stored value is trusted only if every field it needs is a string. Anything
 * else - a corrupt write, a shape from an older build - reads as signed out.
 */
const parseSession = (raw: string): Session | null => {
  const value = JSON.parse(raw) as Partial<Record<string, unknown>>;
  const isString = (key: string) => typeof value?.[key] === "string";

  if (!isString("userId") || !isString("accessToken")) return null;
  if (value.kind === "password" && isString("refreshToken")) return value as unknown as Session;
  if (value.kind === "dev" && __DEV__) return value as unknown as Session;
  return null;
};

let restoring: Promise<void> | null = null;

/** Reads the saved session once per launch. Safe to call more than once. */
export const restoreSession = (): Promise<void> => {
  if (!restoring) {
    restoring = (async () => {
      let restored: Session | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) restored = parseSession(raw);
        AsyncStorage.removeItem(LEGACY_STORAGE_KEY).catch(() => {});
      } catch {
        /* unreadable storage means no saved session */
      }
      commit(restored);
    })();
  }
  return restoring;
};

// --- Sign in / out ----------------------------------------------------------

const startSession = (next: Session): void => {
  generation += 1;
  commit(next);
  persist(next);
};

/** POST /api/auth/login. Throws ApiError - 401 on bad credentials. */
export const signIn = async (identifier: string, password: string): Promise<void> => {
  const { data } = await request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: { identifier: identifier.trim(), password },
  });

  startSession({
    kind: "password",
    userId: data.user.id,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
};

/** Mirrors the API's passwordSchema, so the form can stop a 400 early. */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

export interface NewAccount {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * POST /api/auth/register. The API creates the account AND logs it in,
 * answering with the same shape as login, so this goes straight to a session.
 * Throws ApiError - 409 when the email or username is taken, 400 on a bad field.
 */
export const signUp = async (account: NewAccount): Promise<void> => {
  const { data } = await request<LoginResponse>("/api/auth/register", {
    method: "POST",
    body: {
      email: account.email.trim(),
      username: account.username.trim(),
      password: account.password,
      firstName: account.firstName.trim(),
      lastName: account.lastName.trim(),
    },
  });

  startSession({
    kind: "password",
    userId: data.user.id,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
};

/** The shared dev_local account. The API only mounts this route in development. */
export const signInAsDev = async (): Promise<void> => {
  const { data } = await request<DevTokenResponse>("/api/auth/dev-token", {
    method: "POST",
  });
  startSession({ kind: "dev", userId: data.user.id, accessToken: data.accessToken });
};

/**
 * Ends the session on this device.
 *
 * Local state is cleared FIRST and unconditionally. The server call only
 * revokes the refresh token, and it is best-effort: signing out has to work
 * with no network, and POST /api/auth/logout answers 204 whether or not the
 * token existed, so there is no failure worth showing the user.
 */
export const signOut = async (): Promise<void> => {
  const ending = session;

  generation += 1;
  commit(null);
  persist(null);

  if (ending?.kind === "password") {
    await request<void>("/api/auth/logout", {
      method: "POST",
      body: { refreshToken: ending.refreshToken },
    }).catch(() => {});
  }
};

/**
 * Says what went wrong with a sign-in, so the screen never has to know what an
 * ApiError is. 401 is the API's single login failure and names no field.
 */
export const describeSignInError = (
  err: unknown,
  kind: "password" | "dev" | "register",
): string => {
  if (!(err instanceof ApiError)) {
    return kind === "register"
      ? "Could not create your account. Try again."
      : "Could not sign in. Try again.";
  }

  // The API itself never answers these for auth routes. They come from
  // whatever sits in front of it - the ngrok tunnel answers 502 when nothing
  // is listening on the port it forwards to - and the body is an HTML page, so
  // err.message would only say "Request failed (502)".
  if (err.status === 502 || err.status === 503 || err.status === 504) {
    return "The tunnel is up but the API behind it is not answering. Check the API is running on the port ngrok forwards to.";
  }
  // Names the field itself: "Email is already in use".
  if (kind === "register" && err.status === 409) return `${err.message}.`;
  if (kind === "password" && err.status === 401) {
    return "That email, username or password is not right.";
  }
  if (kind === "dev" && err.status === 404) {
    return "The dev account is only available when the API runs in development.";
  }
  if (err.status === 429) return "Too many attempts. Wait a moment and try again.";
  return err.message;
};

// --- Authenticated calls ----------------------------------------------------

let refreshing: Promise<string> | null = null;

/**
 * Gets a new access token, or signs the user out if that is not possible.
 *
 * Shared between callers for the same reason the old mintOnce was: refresh
 * tokens ROTATE on the API, so two parallel refreshes would each present the
 * same token and the second would be refused as already used.
 *
 * `rejected` is the token the server just refused. If the session already holds
 * a different one, another caller renewed it in the meantime - use that rather
 * than spending a second refresh.
 */
const renew = (rejected: string): Promise<string> => {
  if (session && session.accessToken !== rejected) {
    return Promise.resolve(session.accessToken);
  }
  if (!refreshing) {
    refreshing = (async () => {
      const current = session;
      const startedIn = generation;
      if (!current) throw new ApiError(401, "You are signed out.");

      try {
        let next: Session;
        if (current.kind === "password") {
          const { data } = await request<RefreshResponse>("/api/auth/refresh", {
            method: "POST",
            body: { refreshToken: current.refreshToken },
          });
          next = { ...current, accessToken: data.accessToken, refreshToken: data.refreshToken };
        } else {
          const { data } = await request<DevTokenResponse>("/api/auth/dev-token", {
            method: "POST",
          });
          next = { ...current, accessToken: data.accessToken };
        }

        // Signed out (or in as someone else) while this was in flight.
        if (generation !== startedIn) throw new ApiError(401, "You are signed out.");

        commit(next);
        persist(next);
        return next.accessToken;
      } catch (err) {
        // A refused refresh token means the session is over - expired, revoked
        // by logout-all, or reused. Anything else (no network) keeps it.
        if (err instanceof ApiError && err.status === 401 && generation === startedIn) {
          generation += 1;
          commit(null);
          persist(null);
        }
        throw err;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
};

/** The current access token. Throws a 401 ApiError when signed out. */
export const getAccessToken = async (): Promise<string> => {
  await restoreSession();
  if (!session) throw new ApiError(401, "You are signed out.");
  return session.accessToken;
};

/**
 * Runs an authenticated call, renewing the token once if it has expired.
 *
 * Unchanged contract: retried exactly once, and a second 401 is a real failure.
 */
export const withAuth = async <T>(call: (token: string) => Promise<T>): Promise<T> => {
  const token = await getAccessToken();

  try {
    return await call(token);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    return call(await renew(token));
  }
};