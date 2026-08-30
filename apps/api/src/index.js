// MUST be the first import: it loads the .env files as a side effect, and ES
// modules evaluate static imports in source order. Anything imported above this
// line would be evaluated against an empty process.env.
import "./config/env.js";

import express from "express";
import cors from "cors";
import {
  getRedis,
  getRabbitMq,
  closeRedis,
  closeRabbitMq,
  prisma,
  createLogger,
} from "@stdyapp/core";
import routes from "./routes/index.js";
import { requestLogger } from "./middleware/requestLogger.js";

const log = createLogger("api");

// Hard cap on graceful shutdown before we exit anyway.
const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

// BEFORE express.json(), so a malformed JSON body - which body-parser rejects
// with a 400 before any route runs - is still logged. Registering it after
// would make exactly those requests invisible.
app.use(requestLogger);

app.use(express.json());

app.use("/api", routes);

app.use((err, req, res, next) => {
  const status = err.status || 500;

  // Read by requestLogger when it logs this request on res "finish".
  res.locals.errorSummary = err.message;

  // Stacks are for OUR bugs only. A 404 for a missing user or a 409 on a
  // duplicate email is the normal outcome of a bad request, and printing a full
  // stack for each one buried the genuine failures in noise - those now get a
  // single WARN line from requestLogger instead.
  if (status >= 500) {
    log.error("unhandled error", err);
  }

  res.status(status).json({
    error: err.message || "Internal server error",
  });
});

// Open the long-lived Redis/AMQP connections now, AFTER env is loaded, rather
// than dialling on every health request. Both connect in the background and
// retry on their own, so neither call blocks or throws here.
//
// We deliberately start even when they are down: a server that refuses to boot
// makes the health endpoint that would explain the problem unreachable.
getRedis();
getRabbitMq();

const server = app.listen(PORT, () => {
  log.info(`listening on port ${PORT}`);
});

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
    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([
      closeRedis(),
      closeRabbitMq(),
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
