import { createLogger } from "@stdyapp/core";

import { getDependencyHealth } from "../services/health.service.js";

const log = createLogger("health");

/**
 * GET /api/health - probes every backing service.
 *
 * The response is a strict superset of the previous contract: status, db,
 * uptime and timestamp keep their exact names and meanings, with redis,
 * rabbitmq and a per-dependency `dependencies` breakdown added.
 *
 * 200 when every dependency is reachable, 503 otherwise.
 */
export const healthController = async (_, res) => {
  const { status, isHealthy, dependencies } = await getDependencyHealth();

  if (!isHealthy) {
    // warn, not error: a degraded dependency is already reported by the 503
    // this returns and by redis/rabbitmq's own down-transition logs. Logging it
    // at error level would make a known outage look like three separate faults.
    log.warn("dependency check failed", dependencies);
  }

  res.status(isHealthy ? 200 : 503).json({
    status, // "ok" | "degraded"
    db: dependencies.db.status,
    redis: dependencies.redis.status,
    rabbitmq: dependencies.rabbitmq.status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    dependencies, // per-dependency latencyMs + error detail
  });
};
