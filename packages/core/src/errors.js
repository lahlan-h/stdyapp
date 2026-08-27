/**
 * Turns a connection error into something worth printing.
 *
 * Node 22 dials IPv6 and IPv4 in parallel (autoSelectFamily), so a refused
 * connection arrives as an AggregateError whose own `.message` is an EMPTY
 * STRING - the real detail sits in `.errors[]` and `.code`. Logging
 * `err.message` directly would print "[redis] connection error: " and tell you
 * nothing, which is the opposite of what a health check is for.
 *
 * @param {Error & { code?: string, errors?: Error[] }} err
 * @returns {string}
 */
export const describeConnectionError = (err) => {
  if (!err) return "unknown error";

  // AggregateError: prefer the sub-errors, which carry the address and port.
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    const details = [...new Set(err.errors.map((e) => e?.message).filter(Boolean))];
    if (details.length > 0) return details.join("; ");
  }

  if (err.message) return err.message;
  if (err.code) return err.code;
  return String(err);
};
