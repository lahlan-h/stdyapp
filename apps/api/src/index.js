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
} from "@stdyapp/core";
import routes from "./routes/index.js";

// Hard cap on graceful shutdown before we exit anyway.
const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/api", routes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
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
  console.log(`stdyapp api listening on port ${PORT}`);
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
  console.log(`\n${signal} received, shutting down...`);

  // Deliberately NOT unref()'d: an unref'd timer will not fire while a stray
  // library timer holds the loop open, which is the exact hang we guard against.
  const forceExitTimer = setTimeout(() => {
    console.error("shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([
      closeRedis(),
      closeRabbitMq(),
      prisma.$disconnect(),
    ]);
    console.log("shutdown complete");
  } catch (err) {
    console.error("error during shutdown:", err);
  }

  clearTimeout(forceExitTimer);
  process.exit(0);
};

// SIGTERM is what Docker and Linux send; SIGINT is Ctrl+C, which is the one
// that works on Windows (Windows does not deliver a real SIGTERM).
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
