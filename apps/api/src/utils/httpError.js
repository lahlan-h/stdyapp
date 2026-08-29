/**
 * An error that carries the HTTP status it should produce.
 *
 * Shaped to fit the error middleware in index.js exactly as it already is: that
 * handler reads `err.status` and `err.message`, so a thrown HttpError renders
 * correctly with no middleware change.
 *
 * Because that middleware sends `err.message` straight to the client, the
 * message is CLIENT-VISIBLE. Never put a database error, a hostname or a stack
 * trace in it - pass the original error as `cause` instead, which is logged but
 * never serialised.
 */
export class HttpError extends Error {
  /**
   * @param {number} status - HTTP status code, e.g. 404
   * @param {string} message - safe, client-visible message
   * @param {{ cause?: unknown }} [options] - original error, for logging only
   */
  constructor(status, message, options = {}) {
    super(message, { cause: options.cause });
    this.name = "HttpError";
    this.status = status;
    // Trim this constructor out of the stack so logs point at the throw site.
    Error.captureStackTrace?.(this, HttpError);
  }
}
