import { getDependencyHealth } from "../services/health.service.js";

/**
 * GET /api/health - probes every backing service.
 *
 * The response is a strict superset of the previous contract: status, db,
 * uptime and timestamp keep their exact names and meanings, with redis,
 * rabbitmq and a per-dependency `dependencies` breakdown added.
 *
 * 200 when every dependency is reachable, 503 otherwise.
 */
export const getHealth = async (req, res) => {
  const { status, isHealthy, dependencies } = await getDependencyHealth();

  if (!isHealthy) {
    console.error("Health check failed:", JSON.stringify(dependencies));
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
