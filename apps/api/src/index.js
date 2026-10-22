// MUST be the first import: it loads the .env files as a side effect, and ES
// modules evaluate static imports in source order. Anything imported above this
// line would be evaluated against an empty process.env.
import "./config/env.js";

import {
  getRedis,
  getRabbitMq,
  connectR2,
  closeRedis,
  closeRabbitMq,
  closeR2,
  prisma,
  createLogger,
} from "@stdyapp/core";
import { assertAuthConfig, isDevAuthEnabled } from "./config/auth.js";
import { assertStripeConfig } from "./config/stripe.js";
import app from "./app.js";
import { attachNotificationSocket } from "./realtime/notificationSocket.js";
import { startSessionSweep } from "./jobs/sessionSweep.js";
import { startPhotoUploadSweep } from "./jobs/photoUploadSweep.js";

const log = createLogger("api");

// Before anything else runs: a missing or weak JWT_SECRET must be a loud boot
// failure, not a 500 on the first login. Safe here because ./config/env.js is
// imported above and has already populated process.env.
try {
  assertAuthConfig();
  assertStripeConfig();
} catch (err) {
  log.error(err.message);
  process.exit(1);
}

// A backdoor nobody can see is the dangerous kind. Printed on every start so a
// server running with the credential-free token route live says so out loud,
// rather than leaving it to be discovered.
if (isDevAuthEnabled()) {
  log.warn(
    "DEV AUTH ENABLED - POST /api/auth/dev-token mints access tokens with no " +
      "credentials. This build must never run in staging or production.",
  );
}

// Hard cap on graceful shutdown before we exit anyway.
const SHUTDOWN_TIMEOUT_MS = 10_000;

const PORT = process.env.PORT || 4000;

// Open the long-lived Redis/AMQP connections now, AFTER env is loaded, rather
// than dialling on every health request. Both connect in the background and
// retry on their own, so neither call blocks or throws here.
//
// We deliberately start even when they are down: a server that refuses to boot
// makes the health endpoint that would explain the problem unreachable.
getRedis();
getRabbitMq();

// R2 is stateless HTTPS, so unlike the two above there is no connection to hold
// open and no reconnect to supervise - connectR2() is a ONE-SHOT probe whose
// only job is to say at boot whether the bucket is actually reachable, instead
// of leaving a revoked token or a misspelled bucket to surface as a failed
// upload much later. Also fire-and-forget: it never blocks or throws.
connectR2();

const server = app.listen(PORT, () => {
  log.info(`listening on port ${PORT}`);
});

// Real-time notifications ride on the same HTTP server, as a WebSocket upgrade
// on one path - see realtime/notificationSocket.js. Same port, same CORS-free
// auth story (the socket authenticates with its first message), no second
// listener to deploy.
const closeNotificationSocket = attachNotificationSocket(server);

// Closes sessions a crashed or abandoned app left open - see
// sweepAbandonedSessions for the rule, and jobs/sessionSweep.js for the timer.
const stopSessionSweep = startSessionSweep();

// Deletes post photos uploaded straight to R2 but never attached to a post -
// see services/photoUpload.service.js for the upload flow.
const stopPhotoUploadSweep = startPhotoUploadSweep();

// Guards against re-entry when Ctrl+C is pressed twice.
let isShuttingDown = false;

/**
 * Closes the HTTP server and every backing connection, then exits. Without this,
 * the clients' reconnect timers keep the event loop alive and the process may
 * never exit on Ctrl+C while Redis or RabbitMQ is down.
 * @param {string} signal
 */
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log.info(`${signal} received, shutting down...`);

  // Deliberately NOT unref()'d: an unref'd timer will not fire while a stray
  // library timer holds the loop open, which is the exact hang we guard against.
  const forceExitTimer = setTimeout(() => {
    log.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    // Sockets first: an open WebSocket holds its HTTP connection, so
    // server.close() would otherwise wait on every one of them until the force
    // exit above fired.
    stopSessionSweep();
    stopPhotoUploadSweep();
    await closeNotificationSocket().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([
      closeRedis(),
      closeRabbitMq(),
      closeR2(),
      prisma.$disconnect(),
    ]);
    log.info("shutdown complete");
  } catch (err) {
    log.error("error during shutdown", err);
  }

  clearTimeout(forceExitTimer);
  process.exit(0);
};

// SIGTERM is what Docker and Linux send; SIGINT is Ctrl+C, which is the one
// that works on Windows (Windows does not deliver a real SIGTERM).
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
