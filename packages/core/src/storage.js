import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

import { describeConnectionError } from "./errors.js";
import { createLogger } from "./logger.js";

/**
 * Shared Cloudflare R2 (S3-compatible) client for the monorepo.
 *
 * IMPORTANT: as in ./redis.js and ./rabbitmq.js, nothing here reads process.env
 * at module scope. ES module imports are fully evaluated BEFORE the importing
 * module's body runs, so anything read at import time would be undefined. This
 * file previously built its S3Client and read R2_BUCKET_NAME at module scope and
 * only worked because apps/api/src/index.js happens to import ./config/env.js
 * above @stdyapp/core - reordering those two imports silently produced a client
 * with `endpoint: undefined`. Env is now read inside the functions instead.
 *
 * UNLIKE redis and rabbitmq, R2 is stateless HTTPS: there is no long-lived
 * socket, so there are no "ready"/"connect" events to log from and no up/down
 * state to track. Its boot status therefore comes from one explicit probe -
 * connectR2() - rather than from an event handler.
 */

// Reuse one client per process, mirroring the prisma/redis singletons.
const globalForR2 = globalThis;

// Scoped, so every line from this module is tagged "r2" by the logger itself
// rather than by a hand-written "[r2]" prefix in each message.
const log = createLogger("r2");

// Upper bound on the boot probe. Generous compared with the redis/rabbitmq
// timeouts because R2 is a remote service over the internet rather than a
// container on localhost. The probe is fire-and-forget, so this delays nothing.
const PROBE_TIMEOUT_MS = 5_000;

// Without all four the client cannot address the bucket at all. R2_PUBLIC_URL is
// deliberately absent: it only shapes the URL uploadFile returns, so a missing
// one is worth a warning but does not make the connection unusable.
const REQUIRED_ENV_VARS = [
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];

/**
 * Names the required env vars that are unset, so a misconfiguration is reported
 * as WHAT IS MISSING rather than as the baffling network error you would
 * otherwise get from dialling `undefined`.
 * @returns {string[]}
 */
const missingConfig = () =>
  REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

/**
 * Returns the shared R2 client, creating it on first call.
 * @returns {S3Client}
 */
export const getR2 = () => {
  globalForR2.r2Client ??= new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return globalForR2.r2Client;
};

/**
 * Read per call rather than once at module scope - see the note at the top.
 * @returns {string|undefined}
 */
const bucket = () => process.env.R2_BUCKET_NAME;

/**
 * Turns an S3 SDK failure into a line that names the fix.
 *
 * The SDK reports "endpoint wrong", "key revoked" and "bucket misspelled" as
 * near-identical errors, and each needs a different thing changed, so they are
 * separated here by HTTP status.
 *
 * Never includes credential values - only the NAMES of the vars to check.
 *
 * @param {Error & { $metadata?: { httpStatusCode?: number } }} err
 * @returns {string}
 */
const describeR2Error = (err) => {
  const status = err?.$metadata?.httpStatusCode;

  if (status === 404 || err?.name === "NotFound" || err?.name === "NoSuchBucket") {
    return `bucket "${bucket()}" not found`;
  }

  if (status === 401 || status === 403) {
    return "credentials rejected - check R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY";
  }

  // AbortSignal.timeout() rejects with a TimeoutError; the SDK surfaces an
  // aborted request as AbortError.
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return `timed out after ${PROBE_TIMEOUT_MS}ms`;
  }

  return describeConnectionError(err);
};

/**
 * Probes R2 with HeadBucket - the cheapest call that proves the endpoint,
 * the credentials AND the bucket name are all correct at once. Never throws.
 *
 * The wait is bounded by an abort signal rather than a Promise.race, so the
 * abort propagates across the SDK's internal retries and actually cancels the
 * request. AbortSignal.timeout()'s timer does not hold the event loop open, so
 * an in-flight probe cannot delay shutdown.
 *
 * @returns {Promise<{ status: string, latencyMs: number, error?: string }>}
 */
export const checkR2 = async () => {
  const startedAt = Date.now();

  // Skip the network entirely when we already know the client is unusable -
  // dialling `undefined` would only produce a confusing DNS error.
  const missing = missingConfig();
  if (missing.length > 0) {
    return {
      status: "unreachable",
      latencyMs: 0,
      error: `not configured - ${missing.join(", ")} unset`,
    };
  }

  try {
    await getR2().send(new HeadBucketCommand({ Bucket: bucket() }), {
      abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return { status: "connected", latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      status: "unreachable",
      latencyMs: Date.now() - startedAt,
      error: describeR2Error(err),
    };
  }
};

/**
 * The host part of R2_ENDPOINT, for the boot message.
 *
 * Falls back to the raw value rather than throwing: a malformed endpoint is
 * exactly the case where you most want the log line to still print, and
 * checkR2() will have reported the failure anyway.
 *
 * @returns {string}
 */
const endpointHost = () => {
  try {
    return new URL(process.env.R2_ENDPOINT).host;
  } catch {
    return process.env.R2_ENDPOINT ?? "unknown endpoint";
  }
};

/**
 * Announces R2's status at boot, the counterpart to the "connected to ..." lines
 * redis and rabbitmq print from their connection events.
 *
 * Fire-and-forget by design: it returns immediately and never throws, so a down
 * or misconfigured bucket cannot block or crash startup. Same reasoning as the
 * redis/rabbitmq call sites in apps/api/src/index.js - a server that refuses to
 * boot makes the health endpoint that would explain the problem unreachable.
 *
 * Being a one-shot probe, this says nothing about R2 later in the process's
 * life; GET /api/health is what reports its current state.
 */
export const connectR2 = () => {
  const missing = missingConfig();
  if (missing.length > 0) {
    log.warn(`not configured - ${missing.join(", ")} unset; uploads will fail`);
    return;
  }

  if (!process.env.R2_PUBLIC_URL) {
    log.warn("R2_PUBLIC_URL unset - uploadFile will return an unusable URL");
  }

  checkR2().then(({ status, error }) => {
    if (status === "connected") {
      log.info(`connected to bucket "${bucket()}" at ${endpointHost()}`);
    } else {
      log.error(`unreachable: ${error}`);
    }
  });
};

export const uploadFile = async ({ key, body, contentType }) => {
  await getR2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  // R2 buckets need a public access setting or custom domain configured
  // separately in the Cloudflare dashboard for this URL to resolve publicly
  return `${process.env.R2_PUBLIC_URL}/${key}`;
};

export const deleteFile = async (key) => {
  await getR2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
};

export const getFile = async (key) => {
  return getR2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
};

/** Closes the shared client. Safe to call when it was never created. */
export const closeR2 = async () => {
  const client = globalForR2.r2Client;
  if (!client) return;
  client.destroy();
  globalForR2.r2Client = undefined;
};
