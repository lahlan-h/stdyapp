/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * middleware instead of becoming an unhandled rejection.
 *
 * Express 4 invokes handlers synchronously and ignores the promise they return,
 * so a `throw` inside an `async` handler never reaches the
 * app.use((err, req, res, next) => ...) block in index.js - the request simply
 * hangs until the client gives up. Express 5 does this natively, so this file
 * can be deleted when the app upgrades.
 *
 * Promise.resolve() rather than assuming fn returns a promise keeps this safe
 * for synchronous handlers too, so it can be applied uniformly to every route.
 *
 * @param {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => any} fn
 * @returns {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => void}
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
