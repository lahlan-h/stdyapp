import { createLogger } from "@stdyapp/core";

/**
 * Logs one line per HTTP request, at a severity matching the status code.
 *
 * Hooked on res "finish" rather than wrapping the error middleware, and that is
 * the whole design. Errors reach this API by four different paths and only one
 * of them passes through app.use((err, req, res, next) => ...) in index.js:
 *
 *   - validate.js answers 400 DIRECTLY and calls no next(err)
 *   - Express answers its own HTML 404 when no route matches
 *   - body-parser throws a SyntaxError on malformed JSON
 *   - services throw HttpError, which does reach the error middleware
 *
 * "finish" fires for all four, so this is the only hook that sees every
 * response without touching the routing or service layers.
 */
const log = createLogger("http");

const NANOSECONDS_PER_SECOND = 1e9;
const MILLISECONDS_PER_SECOND = 1000;

// Widths chosen so method, url and status line up in a terminal without a table
// library. A longer url pushes the columns out rather than being truncated - a
// ragged edge is easier to live with than a clipped path.
const METHOD_WIDTH = 6;
const URL_WIDTH = 32;

// A guard against one pathological query string wrapping the whole terminal,
// not a security measure.
const MAX_URL_LENGTH = 120;

/**
 * @param {string} url
 * @returns {string}
 */
const truncateUrl = (url) =>
  url.length > MAX_URL_LENGTH ? `${url.slice(0, MAX_URL_LENGTH - 1)}…` : url;

/**
 * @type {import("express").RequestHandler}
 */
export const requestLogger = (req, res, next) => {
  // hrtime, not Date.now(): this measures a duration, and hrtime is monotonic,
  // so a clock correction mid-request cannot produce a negative latency.
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs =
      (Number(process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_SECOND) *
      MILLISECONDS_PER_SECOND;

    // The full originalUrl, INCLUDING the query string - not the "/api/users/:id"
    // route template. A log line is read to diagnose one specific request, so
    // the concrete id and the actual ?limit=999 are the whole point.
    const url = truncateUrl(req.originalUrl);

    // res.locals.errorSummary is set by whichever layer knows why this failed:
    // validate.js for a schema failure, the error middleware in index.js for a
    // thrown HttpError. Without it a 400 would be an unexplained number.
    const reason = res.locals.errorSummary ? `  ${res.locals.errorSummary}` : "";

    const message =
      `${req.method.padEnd(METHOD_WIDTH)} ${url.padEnd(URL_WIDTH)} ` +
      `${res.statusCode} ${`${durationMs.toFixed(0)}ms`.padStart(6)}${reason}`;

    // 5xx is our bug, 4xx is the client's, anything else is ordinary traffic.
    // The stack for a 5xx is printed by the error middleware, which has already
    // run by the time "finish" fires - printing it here too would double it.
    if (res.statusCode >= 500) log.error(message);
    else if (res.statusCode >= 400) log.warn(message);
    else log.info(message);
  });

  next();
};
