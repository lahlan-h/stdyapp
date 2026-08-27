import Redis from "ioredis";

import { describeConnectionError } from "./errors.js";

/**
 * Shared Redis connection for the monorepo (the API today, workers later).
 *
 * IMPORTANT: nothing here reads process.env at module scope. ES module imports
 * are fully evaluated BEFORE the importing module's body runs, so anything read
 * at import time would be undefined. Env is only read inside getRedis(), which
 * the API calls after dotenv has run. See apps/api/src/config/env.js.
 */

// Reuse one client per process, mirroring the prisma singleton in ./db.js.
const globalForRedis = globalThis;

// Bounded backoff: keep retrying (Redis may come back) but never faster than
// RETRY_MAX_DELAY_MS, so an outage doesn't spin the CPU or flood the console.
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 10_000;
const CONNECT_TIMEOUT_MS = 2_000;
const COMMAND_TIMEOUT_MS = 1_000;
const DEFAULT_REDIS_URL = "redis://localhost:6379";

// Tracks the last logged state so a long outage produces two lines, not hundreds.
let isRedisDown = false;

/**
 * Builds and wires up the ioredis client. Internal - use getRedis().
 * @returns {Redis}
 */
const createRedisClient = () => {
  const redisUrl = process.env.REDIS_URL ?? DEFAULT_REDIS_URL;

  const client = new Redis(redisUrl, {
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Hard ceiling on any single command, so a health check can never hang.
    commandTimeout: COMMAND_TIMEOUT_MS,
    // Fail commands immediately while disconnected instead of buffering them.
    // This is what makes the health check report "unreachable" fast rather than
    // silently queueing the PING until Redis comes back.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) =>
      Math.min(attempt * RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS),
  });

  // MUST be attached immediately: an unhandled "error" event on an EventEmitter
  // is thrown by Node and kills the process. Without this listener, Redis being
  // down would crash the API instead of showing up as "unreachable".
  client.on("error", (err) => {
    if (isRedisDown) return; // log the down-transition only
    isRedisDown = true;
    console.error(`[redis] unreachable: ${describeConnectionError(err)}`);
  });

  client.on("ready", () => {
    console.log(
      isRedisDown ? "[redis] reconnected" : `[redis] connected to ${redisUrl}`,
    );
    isRedisDown = false;
  });

  return client;
};

/**
 * Returns the shared Redis client, creating it on first call.
 * @returns {Redis}
 */
export const getRedis = () => {
  globalForRedis.redisClient ??= createRedisClient();
  return globalForRedis.redisClient;
};

/**
 * Probes Redis with PING. Never throws and never hangs - the wait is bounded by
 * commandTimeout, and enableOfflineQueue:false makes it reject at once while
 * disconnected.
 * @returns {Promise<{ status: string, latencyMs: number, error?: string }>}
 */
export const checkRedis = async () => {
  const startedAt = Date.now();
  try {
    const reply = await getRedis().ping();
    return {
      status: reply === "PONG" ? "connected" : "unreachable",
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      status: "unreachable",
      latencyMs: Date.now() - startedAt,
      error: describeConnectionError(err),
    };
  }
};

/** Closes the shared client. Safe to call when already disconnected. */
export const closeRedis = async () => {
  const client = globalForRedis.redisClient;
  if (!client) return;
  try {
    await client.quit();
  } catch {
    // quit() rejects or hangs when the socket is already down or mid-reconnect.
    // disconnect() is synchronous and also cancels the pending retry timer,
    // which is what actually lets the process exit.
    client.disconnect();
  }
  globalForRedis.redisClient = undefined;
};
