import { Router } from "express";
import {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  uploadUserPhoto,
  removeUserPhoto,
} from "../controllers/users.controller.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireSelf } from "../middleware/requireSelf.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { rawImage } from "../middleware/rawImage.js";
import { cache } from "../middleware/cache.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { userProfileVersionKey, userKey } from "../utils/cache.js";
import {
  CACHE_TTL_USER_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
  RATE_LIMIT_BULK,
  RATE_LIMIT_AVATAR_WRITE,
} from "../config/cache.js";
import { AVATAR_MIME_TYPES, MAX_AVATAR_BYTES } from "../config/upload.js";
import {
  createUserSchema,
  updateUserSchema,
  listUsersQuerySchema,
  userIdParamSchema,
} from "../validation/user.validation.js";

const router = Router();

/**
 * CRUD for /api/users.
 *
 * Two wrappers on every route, both load-bearing:
 *
 *  - validate() short-circuits with a 400 ahead of every handler, so every
 *    controller can assume req.validated exists and is well formed. It is no
 *    longer literally first in the chain - see the ordering note below - but it
 *    is still first of anything that reads the request body or params.
 *  - asyncHandler() is mandatory on Express 4, which ignores the promise an
 *    async handler returns. Without it a thrown error becomes an unhandled
 *    rejection and the request hangs instead of reaching the error middleware
 *    in index.js.
 *
 * Access policy, in full:
 *
 *  - EVERY route needs a valid access token. Router-level rather than per-route
 *    for the reason given in session.routes.js - a route added later is
 *    protected by default, which is the safe direction to fail.
 *  - Reads stay open to any authenticated user: listUsers is a paginated,
 *    searchable directory, so browsing other people is the point.
 *  - Writes are self-only, via requireSelf. Authentication alone would merely
 *    downgrade "anyone can delete any account" to "anyone with an account can
 *    delete any account", which is not the fix it looks like.
 *
 * Signup is unaffected: POST /api/auth/register is still public.
 *
 * Middleware order per route is requireAuth (router) -> rateLimit -> validate
 * -> cache -> [requireSelf] -> asyncHandler. Two of those positions differ from
 * post.routes.js and both are deliberate:
 *
 *  - rateLimit runs BEFORE validate. The limiter exists to bound traffic, not
 *    just well-formed traffic; a flood of malformed requests should still be
 *    refused rather than each one getting a free Zod parse.
 *  - validate runs BEFORE cache, which is new to this router - the post, like
 *    and comment routers do not validate their cached routes at all. It means a
 *    bad id gets the 400 that says so instead of composing a cache key out of
 *    junk, and lets cacheOne read req.params.id knowing it is a UUID.
 *
 * cache still sits after rateLimit, which is the rule middleware/cache.js
 * states: a cache HIT must still spend budget, or the hottest keys - precisely
 * the traffic a limiter exists to bound - would be effectively unlimited.
 *
 * The two /:id/photo routes at the bottom add a THIRD deviation, and it is the
 * only place in this router where requireSelf moves ahead of a body parser:
 *
 *  - requireSelf runs BEFORE rawImage on the upload. rawImage buffers up to
 *    MAX_AVATAR_BYTES into process memory, and there is no reason to read a
 *    single byte of a request we have already decided to answer with a 403.
 *    Reading it first would let any authenticated user spend 5 MB of the server
 *    memory on every request aimed at an account that is not theirs.
 *
 * The two positions that matter most are unchanged even there: rateLimit is
 * still first, so a flood of oversized uploads still costs budget rather than
 * getting a free parse each; and validate still precedes requireSelf, so a
 * malformed id is the 400 that says so rather than a 403 about ownership.
 */
router.use(requireAuth);

/**
 * Three independent buckets. Per-route rather than router-level because the
 * tiers differ, and all three are keyed on req.user.id - see
 * middleware/rateLimit.js for why req.ip would be wrong here. The `name` gives
 * this router its own Redis keyspace, so these budgets are separate from the
 * comment, like and post routers despite sharing the numbers.
 *
 * deleteLimit is the bulk tier for a route that deletes exactly one row: see
 * the note in config/cache.js. Account deletion is the least reversible call in
 * the API, and a caller can only succeed at it once.
 */
const readLimit = rateLimit({ name: "user-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "user-write", ...RATE_LIMIT_WRITE });
const deleteLimit = rateLimit({ name: "user-delete", ...RATE_LIMIT_BULK });

// A fourth bucket, on its own tier rather than sharing writeLimit: an avatar
// upload is bounded in BYTES, not rows. See RATE_LIMIT_AVATAR_WRITE.
const photoLimit = rateLimit({ name: "user-photo", ...RATE_LIMIT_AVATAR_WRITE });

/**
 * GET /:id - the only cached read here.
 *
 * NO viewer in the key, which is the opposite call to post.routes.js and is
 * correct for the reason set out above userKey in utils/cache.js: this route
 * has no requireSelf, so every authenticated caller gets a byte-identical 200
 * and a per-viewer key would store one copy per reader of identical data. The
 * cache() call and the ownership warning it does NOT need are both worth
 * reading together before changing either.
 *
 * Invalidation is not here - it lives in user.service.js, beside the writes.
 */
const cacheOne = cache({
  ttlSec: CACHE_TTL_USER_SEC,
  versionKeys: (req) => [userProfileVersionKey(req.params.id)],
  buildKey: (req, [userVersion]) => userKey(req.params.id, userVersion),
});

// Rate-limited but UNCACHED, the same call post.routes.js, like.routes.js and
// comment.routes.js all make for their paginated GET /all. Any user write
// anywhere would invalidate the entire directory, and ?q is unbounded client
// input - a cache here would thrash and grow at the same time. The limiter
// still applies precisely because it is the most expensive query in the file.
router.get(
  "/",
  readLimit,
  validate({ query: listUsersQuerySchema }),
  asyncHandler(listUsers),
);

// Spends the caller's WRITE budget rather than being exempt: signup is
// POST /api/auth/register, which is public and outside this router entirely.
router.post(
  "/",
  writeLimit,
  validate({ body: createUserSchema }),
  asyncHandler(createUser),
);

router.get(
  "/:id",
  readLimit,
  validate({ params: userIdParamSchema }),
  cacheOne,
  asyncHandler(getUser),
);

// requireSelf sits AFTER validate on both mutating routes, deliberately: a
// malformed id should be the 400 that says so, not a 403 about ownership.
//
// Neither is cached, so requireSelf sitting after cache() in the chain order is
// moot here - but it is also why the authorization trap documented above
// postKey in utils/cache.js cannot arise on this router: no cached route has an
// ownership gate behind it.
router.patch(
  "/:id",
  writeLimit,
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  requireSelf,
  asyncHandler(updateUser),
);

router.delete(
  "/:id",
  deleteLimit,
  validate({ params: userIdParamSchema }),
  requireSelf,
  asyncHandler(deleteUser),
);

/**
 * The avatar, as a singleton sub-resource of the user.
 *
 * Declared AFTER /:id purely for readability - Express matches on the full path
 * and a single :id segment cannot swallow /:id/photo, so the order is not
 * load-bearing here the way it is between a literal and a parameter.
 *
 * Neither route is cached, both being writes. The cached GET /:id above picks up
 * an avatar change on its very next read anyway: both handlers go through
 * updateUser in user.service.js, whose fan-out bumps userProfileVersionKey along
 * with every post version key that embeds this avatar. That is precisely why
 * avatar.service.js delegates its writes there instead of touching Prisma.
 *
 * Uploads carry raw image bytes, NOT multipart/form-data or JSON - see the
 * header of middleware/rawImage.js for why, and note that the global
 * express.json() in index.js passes an image Content-Type through untouched.
 */
router.put(
  "/:id/photo",
  photoLimit,
  validate({ params: userIdParamSchema }),
  requireSelf,
  rawImage({ types: AVATAR_MIME_TYPES, limit: MAX_AVATAR_BYTES }),
  asyncHandler(uploadUserPhoto),
);

// writeLimit rather than photoLimit: this request has no body to bound, and it
// costs one row plus one object delete.
router.delete(
  "/:id/photo",
  writeLimit,
  validate({ params: userIdParamSchema }),
  requireSelf,
  asyncHandler(removeUserPhoto),
);

export default router;
