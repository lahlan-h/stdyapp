import { Router } from "express";
import {
  create,
  status,
  listMine,
  listAll,
  remove,
  removeMine,
} from "../controllers/block.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import { paginationQuerySchema } from "../validation/pagination.validation.js";
import {
  blockUserVersionKey,
  blockListKey,
  blockStatusKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_BLOCK_LIST_SEC,
  CACHE_TTL_BLOCK_STATUS_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
  RATE_LIMIT_BULK,
} from "../config/cache.js";

const router = Router();

// Authentication is a router-level concern here rather than something each route
// opts into, so a route added later is protected by default.
//
// Where follow.routes.js says "reads are open to any authenticated caller, it is
// the WRITES that are scoped", THIS router scopes both. Every route below reads
// or writes only rows where the caller is the blocker, enforced by the WHERE
// clause in block.service.js. See the authorisation note at the top of that file.
router.use(requireAuth);

/**
 * Three independent buckets, so reading your own block list cannot spend the
 * budget that stands between a script and clearing the whole list. All three are
 * keyed on req.user.id — see middleware/rateLimit.js for why req.ip would be
 * wrong here. The `name` is what gives blocks their own keyspace, so these
 * budgets are separate from every other router's despite sharing all three tiers.
 *
 * Note the write tier: RATE_LIMIT_WRITE, not the RATE_LIMIT_FOLLOW_WRITE its
 * closest sibling uses. See config/cache.js — that tier exists for an onboarding
 * burst, and nothing bulk-blocks.
 */
const readLimit = rateLimit({ name: "block-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "block-write", ...RATE_LIMIT_WRITE });
const bulkLimit = rateLimit({ name: "block-bulk", ...RATE_LIMIT_BULK });

/**
 * Cache configuration for the two cacheable reads.
 *
 * Declared here, beside the routes they serve, so this file stays the complete
 * policy for the resource — it already reads that way for authentication and rate
 * limiting. The key FORMATS live in utils/cache.js, because block.service.js has
 * to compose the matching version key to invalidate.
 *
 * ⚠ BOTH KEYS CARRY THE VIEWER, AND THAT IS A SECURITY REQUIREMENT rather than a
 * cache-shaping choice. cache() runs BEFORE the controller and therefore before
 * the service's scoping WHERE clause, so a viewer-less key would store one
 * caller's private block list and hand it to the next caller as a HIT. Caching
 * would become the authorization bypass — the trap the postKey block in
 * utils/cache.js describes, here applying to every read in the router rather than
 * to one route.
 *
 * Note also what is NOT here: neither key is shared between a "mine" route and a
 * "/user/:userId" route the way followersKey and followingKey are. There is no
 * /user/:userId read of this table to share with, and there must never be one.
 */
const cacheMyBlocks = cache({
  ttlSec: CACHE_TTL_BLOCK_LIST_SEC,
  versionKeys: (req) => [blockUserVersionKey(req.user.id)],
  buildKey: (req, [version]) => blockListKey(req.user.id, version),
});

// Stamped with the VIEWER's counter, NOT the target's — the opposite of
// cacheSummary in follow.routes.js, and correct here: blockedByMe can only change
// when THIS viewer blocks or unblocks THIS target, and every such write bumps the
// viewer's counter. The target's counter moves for events this payload cannot
// see, and reading it would leak nothing but would suggest it could.
const cacheStatus = cache({
  ttlSec: CACHE_TTL_BLOCK_STATUS_SEC,
  versionKeys: (req) => [blockUserVersionKey(req.user.id)],
  buildKey: (req, [version]) =>
    blockStatusKey(req.user.id, req.params.userId, version),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> cache.
 *
 * The limiter goes FIRST so that a cache hit still counts against the caller's
 * budget. The other way round, a hot key would be effectively unlimited —
 * precisely the traffic a limiter exists to bound.
 */

// User-scoped paths live in THIS file rather than in users.routes.js: every
// router here is a flat top-level resource that owns its own sub-paths, and two
// files owning blocks is how one of these routes would eventually acquire the
// wrong auth rule by accident.
//
// The two-segment form is declared before the bare "/user/:userId" out of
// convention rather than necessity — Express matches on segment count, so nothing
// here can shadow anything. There is no "/:id" route at all: unblock is keyed by
// the other person's id, which a client rendering a Block menu already has,
// whereas it may never have seen the edge's own id.
//
// Note the absence of "/user/:userId/blockers" and "/blockers", the counterparts
// of the routes follow.routes.js has. Those would answer "who has blocked this
// person", which is the exact fact this feature exists to withhold — from third
// parties and, above all, from the blocked user. They are not missing pending
// implementation. They must never be added.
router.get("/user/:userId/status", readLimit, cacheStatus, status);
router.delete("/user/:userId", writeLimit, remove);

// "Unblock everyone", and NOT at /user/me the way likes put their bulk delete.
// Here /user/:userId already means "the person being blocked", so /user/me would
// read as "unblock myself" — a different operation, and one that does not exist.
router.delete("/mine", bulkLimit, removeMine);

// ⚠ /all MEANS SOMETHING DIFFERENT IN THIS ROUTER, and the difference is
// deliberate. In the other five it is one page of every row in the system. Here
// it is one page of the CALLER'S OWN blocks — see listMyBlocksPage. There is no
// admin role in this codebase, so a global block list would hand the entire
// harassment graph to any authenticated caller.
//
// The inconsistency is the lesser evil: the alternative was omitting the route
// entirely and breaking the shape every other router offers a paginated client.
// It is called out here, in the controller and in the repository because a path
// that means "everything" in five places and "mine" in a sixth is exactly how a
// future edit quietly drops the scope.
//
// UNCACHED, matching GET /all everywhere else. It keeps a limiter anyway — it is
// the most expensive query in the file, and leaving the one uncached route with
// no ceiling would be the wrong reading of "except /all".
router.get("/all", readLimit, validate({ query: paginationQuerySchema }), listAll);

router.post("/", writeLimit, create);
router.get("/", readLimit, cacheMyBlocks, listMine);

// No PATCH, and its absence is deliberate rather than an oversight — the same
// reasoning follow.routes.js gives. Every column on a block is either the primary
// key or half the row's identity: rewriting blockerId or blockedId does not EDIT
// a block, it makes it a different one, which is a delete plus a create.

export default router;
