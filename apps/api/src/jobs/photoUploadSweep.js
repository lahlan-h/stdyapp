import { createLogger, getRedis } from "@stdyapp/core";

import { sweepAbandonedPhotoUploads } from "../services/photoUpload.service.js";

const log = createLogger("photo-upload-sweep");

/**
 * How often the sweep runs. Uploads are only collected after an hour unused
 * (PHOTO_UPLOAD_TTL_MS), so a quarter of that is plenty.
 *
 * ON A TIMER, not just at boot: a long-running server must not let abandoned
 * uploads pile up until its next restart.
 */
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Held while a sweep runs, so that with several API instances only one sweeps
 * at a time - the same lock sessionSweep.js takes, for the same reason.
 */
const LOCK_KEY = "lock:photo-upload-sweep";
const LOCK_TTL_MS = SWEEP_INTERVAL_MS - 30_000;

const sweepOnce = async () => {
  let locked = true;
  try {
    locked = (await getRedis().set(LOCK_KEY, String(process.pid), "PX", LOCK_TTL_MS, "NX")) === "OK";
  } catch {
    // Redis down: sweep anyway. Two instances sweeping at once is safe - the
    // conditional delete means each row is removed at most once - only wasteful.
    locked = true;
  }
  if (!locked) return;

  try {
    const removed = await sweepAbandonedPhotoUploads();
    if (removed > 0) log.info(`removed ${removed} abandoned photo upload(s)`);
  } catch (err) {
    log.warn(`sweep failed: ${err?.message}`);
  }
};

/**
 * Starts the abandoned-upload sweep on a timer. The first run waits a full
 * interval, as sessionSweep's does, so a restart loop cannot become a sweep loop.
 *
 * @returns {() => void} stops it
 */
export const startPhotoUploadSweep = () => {
  const timer = setInterval(() => void sweepOnce(), SWEEP_INTERVAL_MS);
  log.info(`sweeping abandoned photo uploads every ${SWEEP_INTERVAL_MS / 60000} minutes`);
  return () => clearInterval(timer);
};
