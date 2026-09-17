import { Platform } from "react-native";

/**
 * Where the API lives, per platform.
 *
 * "localhost" means the device, not the dev machine, so the Android emulator
 * needs its own alias for the host and a physical phone needs a LAN address
 * that cannot be guessed from here. EXPO_PUBLIC_API_URL overrides all of it -
 * set that when running on hardware.
 */
const DEFAULT_BASE_URL = Platform.select({
  android: "http://10.0.2.2:4000",
  default: "http://localhost:4000",
});

/** Trailing slashes are stripped: the paths below all start with one. */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || DEFAULT_BASE_URL
).replace(/\/+$/, "");

/**
 * Headers the ngrok tunnel needs, and nothing else needs.
 *
 * ngrok-skip-browser-warning defeats the free tier's interstitial: without it,
 * a request whose User-Agent looks browser-ish is answered with an HTML warning
 * page carrying a 200, so response.json() throws and the failure reads as a
 * parse bug rather than a tunnel setting.
 *
 * x-tunnel-key is the shared secret the tunnel's traffic policy checks. Sent
 * only when it is configured, so localhost and LAN setups are unaffected.
 *
 * Both are harmless when not tunnelling - the API ignores unknown headers.
 */
const TUNNEL_KEY = process.env.EXPO_PUBLIC_TUNNEL_KEY;

const tunnelHeaders = (): Record<string, string> => ({
  "ngrok-skip-browser-warning": "true",
  ...(TUNNEL_KEY ? { "x-tunnel-key": TUNNEL_KEY } : {}),
});

/**
 * An API failure with the status attached.
 *
 * The status is what callers branch on - 401 to re-mint a token, 413/415/429 to
 * explain a rejected photo - so it must survive the throw rather than being
 * flattened into a message string.
 */
export class ApiError extends Error {
  status: number;
  retryAfter?: number;

  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** The API is not always reachable, and "Network request failed" explains nothing. */
const UNREACHABLE =
  "Cannot reach the server. Check it is running and that EXPO_PUBLIC_API_URL " +
  "points at it.";

interface ErrorBody {
  error?: string;
  retryAfter?: number;
  details?: { field?: string; message?: string }[];
}

/**
 * Turns a failed response into an ApiError carrying the server's own wording.
 *
 * Every error the API raises is `{ error }`, with validate() adding `details`
 * and the rate limiter adding `retryAfter`. The first detail is worth surfacing
 * because "Validation failed" alone never tells the user which field.
 */
const toApiError = async (response: Response): Promise<ApiError> => {
  let body: ErrorBody = {};
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    /* a non-JSON error body: the status is all we have */
  }

  const detail = body.details?.[0];
  const message =
    detail?.message && body.error === "Validation failed"
      ? `${detail.field ?? "request"}: ${detail.message}`
      : body.error || `Request failed (${response.status})`;

  return new ApiError(response.status, message, body.retryAfter);
};

export interface RequestOptions {
  method?: string;
  /** Sent as JSON. Omit for multipart - pass `formData` instead. */
  body?: unknown;
  /**
   * Multipart payload. Content-Type is deliberately NOT set for these: fetch
   * has to write the boundary itself, and setting it by hand makes the API
   * answer 415.
   */
  formData?: FormData;
  token?: string;
}

/**
 * One fetch, one error shape.
 *
 * Responses are not unwrapped here: the API is inconsistent on purpose - auth
 * routes answer `{ data }`, the feed answers `{ data, pagination }`, and
 * POST /api/posts answers a bare object - so each caller names what it expects
 * instead of this guessing.
 */
export const request = async <T>(
  path: string,
  { method = "GET", body, formData, token }: RequestOptions = {},
): Promise<T> => {
  const headers: Record<string, string> = tunnelHeaders();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch (err) {
    // Keep what actually went wrong. This used to swallow the error whole and
    // report "cannot reach the server" for everything, which is true of a dead
    // API and equally true of an unreadable upload file - and the two need
    // completely different fixes.
    const cause = err instanceof Error ? err.message : String(err);
    if (__DEV__) {
      console.error(`[api] ${method} ${path} failed before a response:`, err);
    }
    throw new ApiError(0, `${UNREACHABLE} (${cause})`);
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
};
