import { AppState, Platform } from "react-native";

import { API_BASE_URL, tunnelHeaders } from "./api";
import { getFreshAccessToken, isSignedIn, subscribeAuth } from "./auth";
import { toNotification, type RawNotification } from "./notificationMapping";
import { loadNotifications } from "./notificationApi";
import * as notificationStore from "./notificationStore";

/** The API's socket path - NOTIFICATION_SOCKET_PATH in apps/api/src/realtime. */
const SOCKET_URL = `${API_BASE_URL.replace(/^http/, "ws")}/api/notifications/ws`;

/** The server's "get a fresh token and come back" close code. */
const CLOSE_UNAUTHORIZED = 4001;
/** A normal close, for when the app chose to hang up. */
const CLOSE_NORMAL = 1000;

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/**
 * How many 4001s in a row are answered with an immediate reconnect. One is the
 * token expiring, which a fresh token fixes; a second straight after a refresh
 * means the server will not take any token from this session, and hammering it
 * would only spend the battery - so from there on, back off like any failure.
 */
const MAX_QUICK_REAUTHS = 1;

/**
 * React Native's WebSocket constructor, which takes a third `options` argument
 * the DOM typings this project compiles against do not know about. The
 * implementation has accepted it for years; only the type needed saying.
 */
const NativeWebSocket = WebSocket as unknown as new (
  url: string,
  protocols: string | string[] | null,
  options: { headers: Record<string, string> },
) => WebSocket;

/** Everything the server sends. */
type SocketEvent =
  | { type: "ready"; unread: number }
  | { type: "created"; notification: RawNotification }
  | { type: "deleted"; id: string }
  | { type: "cleared" }
  | { type: "read"; id: string }
  | { type: "read-all" };

let socket: WebSocket | null = null;
/** Whether a socket SHOULD be open: signed in, and the app in the foreground. */
let running = false;
let attempt = 0;
let quickReauths = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const apply = (event: SocketEvent): void => {
  switch (event.type) {
    case "ready":
      // Connected and authenticated: the backoff starts over, and the list is
      // re-read to cover whatever happened while there was no socket.
      attempt = 0;
      quickReauths = 0;
      notificationStore.setUnread(event.unread);
      loadNotifications().catch(() => {});
      return;
    case "created":
      notificationStore.add(toNotification(event.notification));
      return;
    case "deleted":
      notificationStore.remove(event.id);
      return;
    case "cleared":
      notificationStore.clear();
      return;
    case "read":
      notificationStore.markRead(event.id);
      return;
    case "read-all":
      notificationStore.markAllRead();
      return;
  }
};

/**
 * Exponential, capped, and jittered: after a deploy or an outage every phone
 * reconnects at once, and without the jitter they would all retry in lockstep.
 */
const scheduleRetry = (): void => {
  if (!running || retryTimer) return;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, delay * (0.5 + Math.random() / 2));
};

const connect = async (forceRefresh = false): Promise<void> => {
  if (!running || socket) return;

  // A token good for a while yet - the socket authenticates once and holds it.
  const token = await getFreshAccessToken(forceRefresh);
  if (!running || socket) return;
  if (!token) {
    scheduleRetry();
    return;
  }

  // React Native's WebSocket takes headers as a third argument, which is how
  // the tunnel's headers get through; a browser's cannot, and needs none.
  const ws =
    Platform.OS === "web"
      ? new WebSocket(SOCKET_URL)
      : new NativeWebSocket(SOCKET_URL, null, { headers: tunnelHeaders() });
  socket = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "auth", token }));
  };

  ws.onmessage = (message) => {
    try {
      apply(JSON.parse(String(message.data)) as SocketEvent);
    } catch {
      /* a frame this build does not understand is ignored, not fatal */
    }
  };

  ws.onclose = (event) => {
    if (socket === ws) socket = null;
    if (!running) return;

    if (event.code === CLOSE_UNAUTHORIZED && quickReauths < MAX_QUICK_REAUTHS) {
      quickReauths += 1;
      void connect(true);
      return;
    }
    scheduleRetry();
  };

  // Always followed by onclose, which does the retrying.
  ws.onerror = () => {};
};

const disconnect = (): void => {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const ws = socket;
  socket = null;
  ws?.close(CLOSE_NORMAL);
};

/**
 * Opens or closes the socket to match the session and the app's state.
 *
 * Closed in the background on purpose. The OS suspends a backgrounded app's
 * sockets anyway, usually without telling either end, so holding one open buys
 * nothing but a dead connection to discover later. Coming back to the
 * foreground reconnects, and the reconnect's list read catches everything up.
 *
 * "inactive" counts as foreground: iOS passes through it for a pulled-down
 * notification centre or an incoming call, and dropping the socket for that
 * would only mean reconnecting a second later.
 */
const sync = (): void => {
  const shouldRun = isSignedIn() && AppState.currentState !== "background";

  if (shouldRun && !running) {
    running = true;
    attempt = 0;
    quickReauths = 0;
    void connect();
  } else if (!shouldRun && running) {
    running = false;
    disconnect();
  }
};

let stopStream: (() => void) | null = null;

/**
 * Keeps a notification socket open for as long as someone is signed in and the
 * app is in front. Safe to call more than once; returns the way to stop.
 *
 * Follows the session through subscribeAuth, so signing out closes the socket
 * on the spot - logout() empties the store, and a socket left open would only
 * refill it with the previous account's events.
 */
export const startNotificationStream = (): (() => void) => {
  if (stopStream) return stopStream;

  const unsubscribeAuth = subscribeAuth(sync);
  const appState = AppState.addEventListener("change", sync);
  sync();

  stopStream = () => {
    unsubscribeAuth();
    appState.remove();
    running = false;
    disconnect();
    stopStream = null;
  };
  return stopStream;
};
