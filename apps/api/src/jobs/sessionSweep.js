import { createLogger, getRedis } from "@stdyapp/core";

import { sweepAbandonedSessions } from "../services/session.service.js";

const log = createLogger("session-sweep");

/** How often the sweep runs. Its rule is measured in hours, so minutes is plenty. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Held while a sweep runs, so that with several API instances only one sweeps
 * at a time - two closing the same session would credit its streak and goals
 * twice. Expires on its own, a little under the interval, so a process that
 * dies mid-sweep cannot hold it forever.
 */
const LOCK_KEY = "lock:session-sweep";
const LOCK_TTL_MS = SWEEP_INTERVAL_MS - 30_000;

const sweepOnce = async () => {
  let locked = true;
  try {
    locked = (await getRedis().set(LOCK_KEY, String(process.pid), "PX", LOCK_TTL_MS, "NX")) === "OK";
  } catch {
    // Redis down: sweep anyway. With one instance - the usual case - there is
    // nobody to collide with, and leaving sessions open is the worse outcome.
    locked = true;
  }
  if (!locked) return;

  try {
    const closed = await sweepAbandonedSessions();
    if (closed > 0) log.info(`closed ${closed} abandoned session(s)`);
  } catch (err) {
    log.warn(`sweep failed: ${err?.message}`);
  }
};

/**
 * Starts the abandoned-session sweep on a timer. The first run waits a full
 * interval, so a restart loop cannot turn into a sweep loop.
 *
 * @returns {() => void} stops it
 */
export const startSessionSweep = () => {
  const timer = setInterval(() => void sweepOnce(), SWEEP_INTERVAL_MS);
  log.info(`sweeping abandoned sessions every ${SWEEP_INTERVAL_MS / 60000} minutes`);
  return () => clearInterval(timer);
};
