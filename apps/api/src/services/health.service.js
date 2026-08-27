import { prisma, checkRedis, checkRabbitMq } from "@stdyapp/core";

/**
 * Aggregates backing-service health.
 *
 * This layer owns POLICY - how long we are willing to wait and what the payload
 * looks like. @stdyapp/core owns the connections themselves and knows nothing
 * about HTTP.
 */

// Upper bound on any single probe. A health endpoint that hangs is worse than
// one that reports "unreachable", so we always answer within roughly this
// budget. Generous enough for a cold Supabase pooler connection; redis and
// rabbitmq fail far faster on their own via commandTimeout / isConnected().
const HEALTH_CHECK_TIMEOUT_MS = 3_000;

/**
 * Races a probe against a timer so a wedged socket can't stall the response.
 *
 * NOTE: this does not cancel the underlying operation, it only stops us waiting
 * on it. The .catch() on the original promise is required - if the losing
 * promise rejects after the race has settled, Node reports an unhandled
 * rejection.
 *
 * @param {Promise<any>} promise
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
const withTimeout = (promise, timeoutMs) => {
  let timeoutId;
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`health check timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  promise.catch(() => {}); // swallow a late rejection from the losing promise

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

/**
 * Probes Postgres through Prisma.
 * @returns {Promise<{ status: string, latencyMs: number, error?: string }>}
 */
const checkDatabase = async () => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "connected", latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      status: "unreachable",
      latencyMs: Date.now() - startedAt,
      error: err.message,
    };
  }
};

/**
 * Runs every dependency probe concurrently and folds the results into the
 * health payload.
 *
 * allSettled (rather than all) is deliberate: one dependency being down must
 * not short-circuit or mask the others, so every dependency always gets its own
 * verdict.
 *
 * @returns {Promise<{ status: string, isHealthy: boolean, dependencies: object }>}
 */
export const getDependencyHealth = async () => {
  const probes = {
    db: checkDatabase,
    redis: checkRedis,
    rabbitmq: checkRabbitMq,
  };
  const dependencyNames = Object.keys(probes);

  const settled = await Promise.allSettled(
    dependencyNames.map((name) =>
      withTimeout(probes[name](), HEALTH_CHECK_TIMEOUT_MS),
    ),
  );

  const dependencies = {};
  dependencyNames.forEach((name, index) => {
    const result = settled[index];
    dependencies[name] =
      result.status === "fulfilled"
        ? result.value
        : {
            status: "unreachable",
            latencyMs: HEALTH_CHECK_TIMEOUT_MS,
            error: result.reason?.message ?? "unknown error",
          };
  });

  const isHealthy = dependencyNames.every(
    (name) => dependencies[name].status === "connected",
  );

  return { status: isHealthy ? "ok" : "degraded", isHealthy, dependencies };
};
