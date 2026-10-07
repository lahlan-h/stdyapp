import { WebSocketServer, WebSocket } from "ws";

import { createLogger, prisma } from "@stdyapp/core";

import { verifyAccessToken } from "../services/token.service.js";
import { getUnreadCount } from "../services/notification.service.js";
import { getUnreadConversationCount } from "../services/conversation.service.js";
import { subscribeNotificationEvents } from "./notificationBus.js";

const log = createLogger("notification-socket");

/** The one path this server answers. Every other upgrade is refused. */
export const NOTIFICATION_SOCKET_PATH = "/api/notifications/ws";

/** How long a new socket may stay silent before it must have authenticated. */
const AUTH_TIMEOUT_MS = 5_000;
/** Ping cadence. A socket that misses one is presumed dead and terminated. */
const HEARTBEAT_MS = 30_000;
/** A phone, a tablet and a couple of stale reconnects - not a crawler. */
const MAX_SOCKETS_PER_USER = 5;
/** The client only ever sends one small auth message. */
const MAX_PAYLOAD_BYTES = 4 * 1024;

/**
 * Close codes in the 4000-4999 range, which RFC 6455 leaves to applications.
 *
 * 4001 is the one the client acts on: it means "get a fresh token and come
 * straight back", whether the token was bad, missing or simply expired.
 */
const CLOSE_UNAUTHORIZED = 4001;
const CLOSE_TOO_MANY = 4029;
const CLOSE_GOING_AWAY = 1001;

/**
 * Real-time delivery over a WebSocket - notifications, and direct messages.
 *
 * WHAT IT CARRIES: changes, not state. A socket receives, for its own user:
 *   - notification events - `created`, `deleted`, `cleared`, `read`, `read-all`
 *     - published by notification.service.js;
 *   - message events - `message:created`, `conversation:read` - published by
 *     conversation.service.js, namespaced so a client routing on `type` can
 *     never mistake one family for the other.
 * It is never the source of truth - the client reads both lists over REST on
 * every (re)connect and applies events on top - so a dropped socket costs
 * latency, never correctness.
 *
 * The path still says "notifications" because that is what it first carried;
 * renaming it would break every installed app for no change in behaviour.
 *
 * AUTHENTICATED BY THE FIRST MESSAGE, not by a header or the URL. A browser
 * WebSocket cannot set headers, and a token in the query string would be
 * written to every access log between here and the client. So the socket opens
 * unauthenticated, must send { type: "auth", token } within AUTH_TIMEOUT_MS, and
 * hears nothing until it has.
 *
 * THE TOKEN'S EXPIRY ENDS THE SOCKET. Access tokens live fifteen minutes; a
 * socket that outlived its token would keep delivering to someone whose session
 * may since have been revoked. So the socket is closed with 4001 at the token's
 * `exp`, and the client reconnects with a fresh one.
 *
 * @param {import("node:http").Server} server - the API's HTTP server
 * @returns {() => Promise<void>} closes every socket and stops listening
 */
export const attachNotificationSocket = (server) => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  /** userId -> that user's open, authenticated sockets. */
  const sockets = new Map();

  const register = (userId, ws) => {
    let set = sockets.get(userId);
    if (!set) {
      set = new Set();
      sockets.set(userId, set);
    }
    set.add(ws);
  };

  const unregister = (userId, ws) => {
    const set = sockets.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) sockets.delete(userId);
  };

  // Only this path is upgraded. Anything else is destroyed outright rather than
  // left hanging: an HTTP server that accepts no upgrades would otherwise hold
  // the TCP socket open until the client gave up.
  server.on("upgrade", (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url ?? "", "http://localhost").pathname;
    } catch {
      pathname = "";
    }
    if (pathname !== NOTIFICATION_SOCKET_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.userId = null;
    let authenticating = false;
    let expiryTimer = null;

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    const authTimer = setTimeout(() => {
      if (!ws.userId) ws.close(CLOSE_UNAUTHORIZED, "Authentication required");
    }, AUTH_TIMEOUT_MS);

    ws.on("message", async (data) => {
      // One auth message is the whole of the client's vocabulary. Anything after
      // it is ignored rather than answered, so the socket stays one-way.
      if (ws.userId || authenticating) return;
      authenticating = true;

      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        message = null;
      }
      if (message?.type !== "auth" || typeof message.token !== "string") {
        ws.close(CLOSE_UNAUTHORIZED, "Authentication required");
        return;
      }

      let claims;
      try {
        claims = verifyAccessToken(message.token);
      } catch (err) {
        ws.close(CLOSE_UNAUTHORIZED, err?.message ?? "Invalid access token");
        return;
      }

      // The same check requireAuth makes: a valid signature for an account that
      // has since been deleted is not a session.
      const user = await prisma.user
        .findUnique({ where: { id: claims.sub }, select: { id: true } })
        .catch(() => null);
      if (!user) {
        ws.close(CLOSE_UNAUTHORIZED, "Invalid access token");
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) return;

      if ((sockets.get(user.id)?.size ?? 0) >= MAX_SOCKETS_PER_USER) {
        ws.close(CLOSE_TOO_MANY, "Too many connections");
        return;
      }

      clearTimeout(authTimer);
      ws.userId = user.id;
      register(user.id, ws);

      const msLeft = claims.exp * 1000 - Date.now();
      expiryTimer = setTimeout(
        () => ws.close(CLOSE_UNAUTHORIZED, "Access token expired"),
        Math.max(0, msLeft),
      );

      // Both badges' starting values ride on the ready message, so the client
      // can show the right numbers before its list reads have even gone out.
      // Each falls back to 0 on its own: the client's list reads correct it.
      const [notifications, messages] = await Promise.all([
        getUnreadCount(user.id).catch(() => ({ unread: 0 })),
        getUnreadConversationCount(user.id).catch(() => ({ unread: 0 })),
      ]);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "ready",
            unread: notifications.unread,
            messagesUnread: messages.unread,
          }),
        );
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      clearTimeout(expiryTimer);
      if (ws.userId) unregister(ws.userId, ws);
    });

    // A reset connection emits "error" and then "close"; the close handler does
    // the cleanup. Without a listener here the error would crash the process.
    ws.on("error", () => {});
  });

  const stopListening = subscribeNotificationEvents((userId, event) => {
    const set = sockets.get(userId);
    if (!set) return;
    const payload = JSON.stringify(event);
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  });

  // Mobile networks drop sockets without a FIN; a socket that has not answered
  // the last ping is gone, and keeping it registered would leak it.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);

  log.info(`listening for notification sockets on ${NOTIFICATION_SOCKET_PATH}`);

  /**
   * Called from shutdown, BEFORE server.close: an open WebSocket keeps its HTTP
   * connection alive, so without this the graceful exit would always run out
   * its timeout and be forced.
   */
  return async () => {
    clearInterval(heartbeat);
    for (const ws of wss.clients) ws.close(CLOSE_GOING_AWAY, "Server shutting down");
    await stopListening();
    await new Promise((resolve) => wss.close(() => resolve()));
  };
};
