import amqp from "amqp-connection-manager";

import { describeConnectionError } from "./errors.js";

/**
 * Shared RabbitMQ connection for the monorepo.
 *
 * Uses amqp-connection-manager rather than raw amqplib because amqplib has no
 * reconnect logic at all: one dropped socket and the connection object is dead
 * until the process restarts, so the health check would read red permanently.
 * The manager supervises reconnection and exposes isConnected() - a synchronous
 * flag we can read in a health check with zero I/O, so the check cannot hang.
 *
 * As with ./redis.js, process.env is read only inside the getter, never at
 * module scope.
 */

const globalForRabbitMq = globalThis;

// Heartbeats bound how stale isConnected() can be: a dead peer is detected
// within roughly 2x this interval, so ~10s worst case.
const HEARTBEAT_INTERVAL_SECONDS = 5;
const RECONNECT_INTERVAL_SECONDS = 5;
const DEFAULT_RABBITMQ_URL = "amqp://guest:guest@localhost:5672";

// Tracks the last logged state so a long outage produces two lines, not hundreds.
let isRabbitMqDown = false;

/**
 * Logs a down-transition once, ignoring the repeated retry failures that follow.
 * @param {string} reason
 */
const logRabbitMqDown = (reason) => {
  if (isRabbitMqDown) return;
  isRabbitMqDown = true;
  console.error(`[rabbitmq] unreachable: ${reason}`);
};

/**
 * Returns the shared connection manager, creating it on first call.
 * connect() returns immediately and retries in the background - it never throws,
 * so a down broker cannot block startup.
 * @returns {import("amqp-connection-manager").AmqpConnectionManager}
 */
export const getRabbitMq = () => {
  if (globalForRabbitMq.rabbitMqConnection) {
    return globalForRabbitMq.rabbitMqConnection;
  }

  const rabbitMqUrl = process.env.RABBITMQ_URL ?? DEFAULT_RABBITMQ_URL;

  const connection = amqp.connect([rabbitMqUrl], {
    heartbeatIntervalInSeconds: HEARTBEAT_INTERVAL_SECONDS,
    reconnectTimeInSeconds: RECONNECT_INTERVAL_SECONDS,
  });

  connection.on("connect", () => {
    console.log(
      isRabbitMqDown ? "[rabbitmq] reconnected" : "[rabbitmq] connected",
    );
    isRabbitMqDown = false;
  });

  // Two distinct failure events, and we need both:
  //   connectFailed - a connection ATTEMPT failed. This is what fires when the
  //                   broker is already down at startup, and on every retry.
  //   disconnect    - an ESTABLISHED connection dropped.
  // Listening only to "disconnect" would log nothing at all on a cold start
  // with RabbitMQ down.
  connection.on("connectFailed", ({ err }) =>
    logRabbitMqDown(describeConnectionError(err)),
  );
  connection.on("disconnect", ({ err }) =>
    logRabbitMqDown(describeConnectionError(err)),
  );

  globalForRabbitMq.rabbitMqConnection = connection;
  return connection;
};

/**
 * Reports broker reachability. isConnected() is synchronous underneath, so this
 * cannot hang; it is async only to match the shape of the other checks.
 *
 * Note this reads a cached flag maintained by the heartbeat rather than issuing
 * a fresh round trip, so it can lag reality by up to ~2x the heartbeat interval.
 * @returns {Promise<{ status: string, latencyMs: number, error?: string }>}
 */
export const checkRabbitMq = async () => {
  const startedAt = Date.now();
  const isConnected = getRabbitMq().isConnected();
  return {
    status: isConnected ? "connected" : "unreachable",
    latencyMs: Date.now() - startedAt,
    ...(isConnected ? {} : { error: "no active AMQP connection" }),
  };
};

/** Closes the connection and stops its reconnect timer. */
export const closeRabbitMq = async () => {
  const connection = globalForRabbitMq.rabbitMqConnection;
  if (!connection) return;
  await connection.close();
  globalForRabbitMq.rabbitMqConnection = undefined;
};
