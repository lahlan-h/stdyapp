import express from "express";
import cors from "cors";
import { createLogger } from "@stdyapp/core";

import routes from "./routes/index.js";
import stripeWebhookRoutes from "./routes/stripeWebhook.routes.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { corsOptions, warnIfCorsUnconfigured } from "./config/cors.js";
import { HttpError } from "./utils/httpError.js";

const log = createLogger("api");

/**
 * The Express app: middleware, routes, the 404 and the error handler - and
 * nothing that starts anything. No listen, no connections, no timers.
 *
 * Its own module so a test can drive real HTTP requests through the routes,
 * validation and controllers exactly as the app does, rather than calling a
 * service and trusting that the controller in front of it passes everything
 * along. index.js imports it and does the starting.
 *
 * Expects process.env to be loaded already - index.js imports config/env.js
 * first, and a test sets its variables before importing this.
 */
const app = express();
app.use(cors(corsOptions));
warnIfCorsUnconfigured(log);

// BEFORE express.json(), so a malformed JSON body - which body-parser rejects
// with a 400 before any route runs - is still logged. Registering it after
// would make exactly those requests invisible.
app.use(requestLogger);

// ⚠ ABOVE express.json() ON PURPOSE. Stripe signs the raw request body, so this
// route needs the bytes rather than a parsed object - see the note in
// routes/stripeWebhook.routes.js. Below the logger so deliveries are still
// logged like everything else.
app.use("/api/webhooks/stripe", stripeWebhookRoutes);

// Bounded: an unbounded JSON body lets one request buffer arbitrary memory in
// the process. 1mb is far above any payload this API accepts - image uploads
// go through multipart, not here.
app.use(express.json({ limit: "1mb" }));

app.use("/api", routes);

// Anything that reached here matched no route. Without this, Express falls
// back to its built-in handler, which answers with an HTML page - so the one
// response a client is most likely to hit by accident was the only one that
// broke the JSON contract every other response follows. Handed to the error
// middleware below rather than answered here, so 404s are logged and shaped
// exactly like every other error.
app.use((req, _res, next) => next(new HttpError(404, `Cannot ${req.method} ${req.originalUrl}`)));

app.use((err, req, res, next) => {
  const status = err.status || 500;

  // Read by requestLogger when it logs this request on res "finish".
  res.locals.errorSummary = err.message;

  // Stacks are for OUR bugs only. A 404 for a missing user or a 409 on a
  // duplicate email is the normal outcome of a bad request, and printing a full
  // stack for each one buried the genuine failures in noise - those now get a
  // single WARN line from requestLogger instead.
  if (status >= 500) {
    log.error("unhandled error", err);
  }

  res.status(status).json({
    // Anything a service attached for the client to act on - joinSession's
    // groupId, say. Spread FIRST so it can never overwrite the message.
    ...(status < 500 && err.data ? err.data : {}),
    error: err.message || "Internal server error",
  });
});

export default app;
