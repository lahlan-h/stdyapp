import { getRedis, createLogger } from "@stdyapp/core";

/**
 * Per-user fixed-window rate limiting, backed by Redis.
 *
 * A factory returning a request handler, the shape validate.js established for
 * parameterised middleware. Each call produces an INDEPENDENT bucket, so reads,
 * writes and the destructive bulk delete cannot spend each other's budget.
 *
 * MUST be mounted after requireAuth: the bucket is keyed on req.user.id, which
 * is what makes the limit follow a person rather than an address. Keying on
 * req.ip instead would be wrong here twice over — index.js does not set
 * "trust proxy", so behind any proxy req.ip is the proxy's address and every
 * user in the world would share one bucket.
 */

const log = createLogger("ratelimit");

const MILLISECONDS_PER_SECOND = 1000;

/**
 * INCR and EXPIRE as ONE atomic step.
 *
 * Issued separately, a process death or a connection drop between them leaves a
 * counter with no TTL — a key that never resets and locks that user out of that
 * route permanently. Lua runs atomically inside Redis, so the pair either both
 * happen or neither does.
 *
 * The `if count == 1` is what makes this a FIXED window rather than a sliding
 * one: only the request that creates the counter sets its lifetime, so the
 * window runs from the first request in it, and later requests do not extend it.
 */
const RATE_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

const COMMAND_NAME = "stdyappRateLimit";

/**
 * defineCommand registers the script on the ioredis client, which then ships it
 * as EVALSHA and falls back to EVAL only if Redis has not seen it.
 *
 * The guard tests the INSTANCE rather than a module-level "already defined"
 * flag, and that difference is load-bearing: closeRedis() sets core's singleton
 * back to undefined, so the next getRedis() hands back a BRAND NEW client with
 * no custom commands on it. A module flag would still read true, this function
 * would skip the registration, and every call would then fail on an undefined
 * method — permanently, and silently, since the caller fails open.
 */
const getLimiterClient = () => {
  const redis = getRedis();

  if (typeof redis[COMMAND_NAME] !== "function") {
    redis.defineCommand(COMMAND_NAME, { numberOfKeys: 1, lua: RATE_LIMIT_LUA });
  }

  return redis;
};

// Two log lines per outage, not one per request — see packages/core/src/redis.js.
let isDegraded = false;

const noteFailure = (name, err) => {
  if (isDegraded) return;
  isDegraded = true;
  log.warn(`degraded, allowing unlimited traffic: ${name} - ${err?.message}`);
};

const noteSuccess = () => {
  if (!isDegraded) return;
  isDegraded = false;
  log.info("recovered, enforcing limits again");
};

// A mounting mistake, not a runtime condition — logged once rather than per
// request so it is visible in a busy log without drowning it.
let hasWarnedAboutMissingUser = false;

/**
 * Builds a rate-limit middleware for one bucket.
 *
 * @param {{ name: string, max: number, windowSec: number }} options
 *   name      - bucket identifier, part of the Redis key; distinct per tier
 *   max       - requests allowed per window
 *   windowSec - window length in seconds
 * @returns {import("express").RequestHandler}
 */
export const rateLimit = ({ name, max, windowSec }) => {
  const windowMs = windowSec * MILLISECONDS_PER_SECOND;

  return async (req, res, next) => {
    const identity = req.user?.id;

    // Fails OPEN rather than closed, unlike requireSelf's 403. A limiter that
    // cannot identify the caller has lost its ability to discriminate, and
    // rejecting everyone would convert a mounting bug into a total outage of
    // the route — a far worse failure than briefly not enforcing a ceiling.
    if (!identity) {
      if (!hasWarnedAboutMissingUser) {
        hasWarnedAboutMissingUser = true;
        log.warn(`${name} is mounted without requireAuth ahead of it; not enforcing`);
      }
      return next();
    }

    // The window index lives IN the key, so each window is a different counter
    // that starts at zero on its own. A TTL that somehow never lands can then
    // only ever poison the one window it belongs to, never the next.
    const windowIndex = Math.floor(Date.now() / windowMs);
    const key = `rl:${name}:${identity}:${windowIndex}`;

    let count;
    try {
      count = await getLimiterClient()[COMMAND_NAME](key, windowSec);
      noteSuccess();
    } catch (err) {
      // Fail open, per the same reasoning as the cache: Redis is not on the
      // correctness path for this API. An explicit catch is also mandatory
      // rather than defensive — Express 4 does not catch rejections from async
      // middleware, so without it a Redis outage would HANG every limited
      // route instead of degrading it.
      noteFailure(name, err);
      return next();
    }

    // Time left in this window. Floored at 1: a request landing on the boundary
    // would otherwise be told to retry after 0 seconds, which a client can only
    // read as "immediately" — the one thing it must not do.
    const resetSec = Math.max(
      1,
      Math.ceil(((windowIndex + 1) * windowMs - Date.now()) / MILLISECONDS_PER_SECOND),
    );

    // Set on EVERY response, not just rejections, so a well-behaved client can
    // slow down before it is refused rather than discovering the ceiling by
    // hitting it.
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(Math.max(0, max - count)));
    res.set("RateLimit-Reset", String(resetSec));

    if (count > max) {
      res.set("Retry-After", String(resetSec));

      // Hand the reason to requestLogger, which logs on res "finish" and cannot
      // see the body. Set by hand here because this response never reaches the
      // error middleware in index.js, which is what normally does it.
      res.locals.errorSummary = `rate limit: ${name} ${max}/${windowSec}s`;

      // Responds DIRECTLY rather than via next(new HttpError(429, ...)), the
      // same call validate.js makes and for the same reason: the error
      // middleware renders only { error: message } and cannot set a header, and
      // a 429 without Retry-After tells a client to guess.
      return res.status(429).json({ error: "Too many requests", retryAfter: resetSec });
    }

    next();
  };
};
