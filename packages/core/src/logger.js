/**
 * The logger for the whole monorepo.
 *
 * Zero dependencies, matching how the rest of the codebase hand-rolls its small
 * utilities (httpError.js, prismaError.js, asyncHandler.js). It exists so that
 * every line the process prints shares one format, one severity scheme and one
 * timestamp - previously there were three ad-hoc styles ("[redis] unreachable:",
 * "stdyapp api listening on port 4000", "Health check failed:") and no way to
 * tell an ordinary event from a real problem at a glance.
 *
 * Lives in @stdyapp/core rather than apps/api because core itself logs (redis,
 * rabbitmq) and the API already depends on core. It knows nothing about HTTP -
 * that is apps/api/src/middleware/requestLogger.js.
 *
 * IMPORTANT: like every other module in this package, nothing here reads
 * process.env at module scope. ES module imports are fully evaluated BEFORE the
 * importing module's body runs, so a module-scope read would happen before
 * apps/api/src/config/env.js has loaded the .env files and would see undefined.
 * See the same note in ./redis.js.
 */

// Numeric so a level can be compared with >=. Ordered least to most severe.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const DEFAULT_LEVEL = "info";

// Padded to the width of the longest name ("error") so the columns after the
// level line up regardless of severity.
const LEVEL_WIDTH = 5;

const COLOURS = {
  debug: "\x1b[90m", // grey
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  scope: "\x1b[35m", // magenta
  reset: "\x1b[0m",
};

/**
 * Colour is decided per call, not once at import, because isTTY is only known
 * after the process has its stdio - and because a test can flip it.
 *
 * Without this check, piping the server's output to a file or reading it back
 * with `docker logs` yields escape bytes wrapped around every line. That is the
 * classic hand-rolled-logger bug.
 *
 * @returns {boolean}
 */
const supportsColour = () => Boolean(process.stdout.isTTY);

/**
 * Reads the configured threshold lazily. An unrecognised LOG_LEVEL falls back
 * to the default rather than throwing: a typo in a .env file should not stop
 * the server from booting.
 *
 * @returns {number}
 */
const currentThreshold = () => {
  const configured = process.env.LOG_LEVEL?.toLowerCase();
  return LEVELS[configured] ?? LEVELS[DEFAULT_LEVEL];
};

/**
 * "14:22:04.881" - time only. These logs are read live in a terminal where the
 * date is the same for every line and only costs width.
 *
 * @returns {string}
 */
const timestamp = () => new Date().toISOString().slice(11, 23);

/**
 * Renders the extra argument, if any.
 *
 * An Error is rendered as its stack, so callers can pass one directly. Anything
 * else goes through JSON.stringify, with a try/catch because a circular object
 * would otherwise throw from inside the logger - a logger must never be the
 * thing that crashes the process.
 *
 * @param {unknown} detail
 * @returns {string}
 */
const formatDetail = (detail) => {
  if (detail === undefined) return "";
  if (detail instanceof Error) return `\n${detail.stack}`;

  try {
    return ` ${JSON.stringify(detail)}`;
  } catch {
    return ` ${String(detail)}`;
  }
};

/**
 * Writes one line.
 *
 * warn and error go to stderr, debug and info to stdout. This mirrors the
 * console.log/console.error split the codebase already used, and is what makes
 * `node src/index.js 2> errors.log` and Docker's log driver able to separate
 * problems from ordinary traffic.
 *
 * @param {keyof LEVELS} level
 * @param {string|undefined} scope
 * @param {string} message
 * @param {unknown} [detail]
 */
const write = (level, scope, message, detail) => {
  if (LEVELS[level] < currentThreshold()) return;

  const colour = supportsColour();
  const label = level.toUpperCase().padEnd(LEVEL_WIDTH);

  const parts = [
    colour ? `${COLOURS.debug}${timestamp()}${COLOURS.reset}` : timestamp(),
    colour ? `${COLOURS[level]}${label}${COLOURS.reset}` : label,
  ];

  if (scope) {
    parts.push(colour ? `${COLOURS.scope}${scope}${COLOURS.reset}` : scope);
  }

  parts.push(message);

  const line = `${parts.join(" ")}${formatDetail(detail)}\n`;

  // process.stdout/stderr rather than console.*, so that a future console
  // override (a test spy, a stray monkey-patch) cannot silently redirect logs.
  if (LEVELS[level] >= LEVELS.warn) process.stderr.write(line);
  else process.stdout.write(line);
};

/**
 * Builds a logger, optionally tagged with a scope.
 *
 * The scope replaces the "[redis]" / "[rabbitmq]" prefixes that used to be
 * hand-written into each message string, so the origin becomes structure rather
 * than convention and cannot drift.
 *
 * @param {string} [scope] - e.g. "redis", "api"
 * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
 */
export const createLogger = (scope) => ({
  debug: (message, detail) => write("debug", scope, message, detail),
  info: (message, detail) => write("info", scope, message, detail),
  warn: (message, detail) => write("warn", scope, message, detail),
  error: (message, detail) => write("error", scope, message, detail),
});

/** Unscoped logger, for callers with nothing more specific to say. */
export const logger = createLogger();
