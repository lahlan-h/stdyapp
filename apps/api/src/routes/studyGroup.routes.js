import { Router } from "express";
import {
  create,
  getOne,
  search,
  update,
  remove,
  transferOwnership,
  join,
  leave,
  members,
  kickMember,
  setMemberRole,
} from "../controllers/studyGroup.controller.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { cache } from "../middleware/cache.js";
import {
  groupIdParamSchema,
  groupMemberParamSchema,
  createGroupSchema,
  updateGroupSchema,
  transferOwnershipSchema,
  joinGroupSchema,
  setMemberRoleSchema,
  searchGroupsQuerySchema,
} from "../validation/studyGroup.validation.js";
import {
  groupContentVersionKey,
  groupMemberVersionKey,
  groupKey,
  groupMembersKey,
} from "../utils/cache.js";
import {
  CACHE_TTL_GROUP_SEC,
  CACHE_TTL_GROUP_MEMBERS_SEC,
  RATE_LIMIT_READ,
  RATE_LIMIT_WRITE,
  RATE_LIMIT_BULK,
  RATE_LIMIT_GROUP_JOIN,
} from "../config/cache.js";

const router = Router();

// See session.routes.js. Note GET / (search) is protected too: the controller
// passes the caller's id to searchGroups so results reflect their membership.
// optionalAuth would be the right call if anonymous discovery is ever wanted.
router.use(requireAuth);

/**
 * Four buckets, all keyed on req.user.id and all in the group keyspace.
 *
 * bulkLimit is on DELETE /:id rather than writeLimit, and not for row count —
 * it deletes one group. It cascades every membership in it, so one call removes
 * rows belonging to people other than the caller, and irreversibly. That is the
 * property RATE_LIMIT_BULK exists for; see the note in config/cache.js.
 *
 * joinLimit is the only tier in this codebase defined against a GUESSING attack
 * rather than a cost — POST /:id/join carries a secret that can be brute-forced
 * one 403 at a time. See RATE_LIMIT_GROUP_JOIN.
 */
const readLimit = rateLimit({ name: "group-read", ...RATE_LIMIT_READ });
const writeLimit = rateLimit({ name: "group-write", ...RATE_LIMIT_WRITE });
const bulkLimit = rateLimit({ name: "group-bulk", ...RATE_LIMIT_BULK });
const joinLimit = rateLimit({ name: "group-join", ...RATE_LIMIT_GROUP_JOIN });

/**
 * Cache configuration for the two cacheable reads.
 *
 * GET / (search) is deliberately NOT among them, exactly as GET /api/users is
 * in users.routes.js and for the same two reasons: its ?q is unbounded client
 * input, so the keyspace would grow without bound, and with no ?q at all it
 * returns every group in the database — an entry that any group write anywhere
 * would invalidate. It keeps a limiter regardless, because it is the most
 * expensive query in the file.
 */

/**
 * GET /:id — THE VIEWER IS IN THE KEY, and for a different reason from
 * sessions. This route 403s for nobody; what makes it per-viewer is
 * sanitizeGroup, which strips joinCode unless the caller owns the group. Two
 * bodies, so two keys. See the warning above groupKey.
 *
 * STAMPED WITH BOTH COUNTERS, because findGroupById includes
 * _count.memberships — a join or a leave changes this payload without touching
 * the study_groups row at all.
 */
const cacheOne = cache({
  ttlSec: CACHE_TTL_GROUP_SEC,
  versionKeys: (req) => [
    groupContentVersionKey(req.params.id),
    groupMemberVersionKey(req.params.id),
  ],
  buildKey: (req, [contentVersion, memberVersion]) =>
    groupKey(req.params.id, req.user.id, contentVersion, memberVersion),
});

// GET /:id/members — no viewer, because listMembers takes no requester and
// sanitises nothing. Every caller gets a byte-identical body.
const cacheMembers = cache({
  ttlSec: CACHE_TTL_GROUP_MEMBERS_SEC,
  versionKeys: (req) => [groupMemberVersionKey(req.params.id)],
  buildKey: (req, [version]) => groupMembersKey(req.params.id, version),
});

/**
 * Middleware order per route is requireAuth (above) -> rateLimit -> validate ->
 * cache. See the note in session.routes.js for why the limiter goes first.
 */

router.post("/", writeLimit, validate({ body: createGroupSchema }), create);

// UNCACHED by design — see the note above. ?q=searchTerm; omit q to list
// everything.
router.get("/", readLimit, validate({ query: searchGroupsQuerySchema }), search);

router.get(
  "/:id",
  readLimit,
  validate({ params: groupIdParamSchema }),
  cacheOne,
  getOne,
);

router.patch(
  "/:id",
  writeLimit,
  validate({ params: groupIdParamSchema, body: updateGroupSchema }),
  update,
);

router.delete(
  "/:id",
  bulkLimit,
  validate({ params: groupIdParamSchema }),
  remove,
);

router.patch(
  "/:id/owner",
  writeLimit,
  validate({ params: groupIdParamSchema, body: transferOwnershipSchema }),
  transferOwnership,
);

router.post(
  "/:id/join",
  joinLimit,
  validate({ params: groupIdParamSchema, body: joinGroupSchema }),
  join,
);

router.delete(
  "/:id/leave",
  writeLimit,
  validate({ params: groupIdParamSchema }),
  leave,
);

router.get(
  "/:id/members",
  readLimit,
  validate({ params: groupIdParamSchema }),
  cacheMembers,
  members,
);

router.delete(
  "/:id/members/:userId",
  writeLimit,
  validate({ params: groupMemberParamSchema }),
  kickMember,
);

router.patch(
  "/:id/members/:userId/role",
  writeLimit,
  validate({ params: groupMemberParamSchema, body: setMemberRoleSchema }),
  setMemberRole,
);

export default router;
