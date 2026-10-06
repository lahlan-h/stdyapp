import { EventEmitter } from "node:events";

import { createLogger, getRedis } from "@stdyapp/core";

const log = createLogger("notification-bus");

/**
 * How notification changes travel from the request that made them to every
 * socket that should hear about them.
 *
 * ONE Redis channel, not one per user. A per-user channel would mean a SUBSCRIBE
 * and UNSUBSCRIBE for every socket that comes and goes; one channel costs a
 * single subscription per API process, and each process discards the events for
 * users it has no socket for - a Map lookup. At this app's scale that trade is
 * not close.
 *
 * Redis rather than an in-process emitter alone because a like handled by one API
 * instance must reach a socket held by another. With one instance the two are
 * equivalent; with two, only Redis is correct.
 */
const CHANNEL = "notif:events";

/**
 * The in-process path, used only when Redis cannot take the publish.
 *
 * Without it a Redis outage would silence real-time delivery even for sockets
 * held by THIS process, which can be reached without Redis at all. With several
 * instances the fallback is partial - other processes miss the event - but the
 * client refetches its list on every reconnect, so nothing is lost for good.
 */
const local = new EventEmitter();

let subscriber = null;

/**
 * Sends one notification change to whichever process holds the user's sockets.
 *
 * NEVER THROWS, for emitNotification's reason: it runs on the tail of a write
 * that has already committed, and failing to announce a change is not a reason
 * to fail the change. The shared client has enableOfflineQueue off, so while
 * Redis is down this rejects at once and the local path takes over.
 *
 * Exactly one of the two paths delivers. When the publish succeeds, this
 * process hears it back through its own subscription, so emitting locally as
 * well would deliver every event twice.
 *
 * @param {string} userId - whose sockets should receive it
 * @param {{ type: string } & Record<string, unknown>} event
 */
export const publishNotificationEvent = async (userId, event) => {
  const payload = JSON.stringify({ userId, event });
  try {
    await getRedis().publish(CHANNEL, payload);
  } catch (err) {
    log.warn(`publish failed, delivering in-process only: ${err?.message}`);
    local.emit("message", payload);
  }
};

/**
 * Calls `handler(userId, event)` for every notification change, from any process.
 *
 * Its own connection, duplicated from the shared one: an ioredis client in
 * subscriber mode can run nothing but (UN)SUBSCRIBE, so sharing would break
 * every cache read and rate limit in the API. The duplicate also drops the
 * shared client's 1s command timeout and fail-fast offline queue, which suit a
 * request path and not a connection meant to sit open for the life of the
 * process - ioredis re-subscribes by itself after a reconnect.
 *
 * @param {(userId: string, event: object) => void} handler
 * @returns {() => Promise<void>} stops listening and closes the connection
 */
export const subscribeNotificationEvents = (handler) => {
  const deliver = (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof message?.userId === "string" && message.event?.type) {
      handler(message.userId, message.event);
    }
  };

  local.on("message", deliver);

  subscriber = getRedis().duplicate({
    commandTimeout: undefined,
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
  });
  // MUST be attached at once - an unhandled "error" event kills the process.
  // The shared client already logs Redis going down, so this stays quiet.
  subscriber.on("error", () => {});
  subscriber.on("message", (channel, raw) => {
    if (channel === CHANNEL) deliver(raw);
  });
  subscriber.subscribe(CHANNEL).catch((err) => {
    log.warn(`subscribe failed, real-time limited to this process: ${err?.message}`);
  });

  return async () => {
    local.off("message", deliver);
    const connection = subscriber;
    subscriber = null;
    if (!connection) return;
    try {
      await connection.quit();
    } catch {
      connection.disconnect();
    }
  };
};
