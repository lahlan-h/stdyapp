import { prisma } from "@stdyapp/core";

// The same three-field allowlist every joined social list in this API uses. It
// is what keeps passwordHash and email out of a block list, so it must stay a
// select rather than becoming `user: true`.
const BLOCK_USER_SELECT = {
  select: { id: true, username: true, avatarUrl: true },
};

// The block is returned with the person being blocked joined on, because the one
// caller that returns it to a client is rendering "you have blocked X". The
// blocker is deliberately NOT joined: the only caller who can read this row is
// the blocker, and a client does not need its own profile echoed back.
export const createBlock = ({ blockerId, blockedId }) => {
  return prisma.block.create({
    data: { blockerId, blockedId },
    include: { blocked: BLOCK_USER_SELECT },
  });
};

// The compound-unique lookup, the same shape as findFollow. blocks has no
// natural single-column key other than its id, and no caller ever knows that id:
// a client holds the other person's id and its own token, which is exactly this
// pair.
//
// Takes the pair in fixed (blocker, blocked) order and NEVER a "direction" flag,
// for the reason deleteFollow gives — a boolean that swapped which end is
// authorised is exactly the thing that gets passed the wrong way round once,
// silently.
export const findBlock = (blockerId, blockedId) => {
  return prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
  });
};

/**
 * Everyone this user has blocked — their own block list, and the ONLY read of
 * this table any route exposes.
 *
 * Note the absence of a findBlockersByUser twin returning rows. Every other
 * repository here has one, because those lists are public; the missing function
 * IS the privacy model. See the authorisation note in block.service.js.
 *
 * Ordered by the blocked user's username, copying findFollowersByUser, and for
 * the same reason: Block has no createdAt, so there is no chronological key, and
 * WITHOUT an orderBy Postgres returns whatever the plan yields — which changes
 * once the table grows and the planner switches from a sequential scan to an
 * index scan, quietly breaking any pagination built on top.
 *
 * Served by the leading column of @@unique([blockerId, blockedId]).
 */
export const findBlocksByBlocker = (blockerId) => {
  return prisma.block.findMany({
    where: { blockerId },
    include: { blocked: BLOCK_USER_SELECT },
    orderBy: { blocked: { username: "asc" } },
  });
};

/**
 * One page of the caller's OWN blocks, with the totals a pager needs.
 *
 * NOTE the where clause on BOTH halves. This backs GET /api/blocks/all, and that
 * path means something different here from every other router: there it is every
 * row in the system, here it is the caller's own rows only. A global block list
 * would hand the whole harassment graph to any authenticated caller, and this
 * codebase has no admin role to gate one behind. If the filter ever disappears
 * from either half, that is the bug.
 *
 * The findMany and the count run in one transaction so the page and its total
 * are read from the same snapshot.
 *
 * @returns {Promise<[object[], number]>} the page, and the caller's total
 */
export const findBlocksPageByBlocker = ({ blockerId, skip, take }) => {
  return prisma.$transaction([
    prisma.block.findMany({
      where: { blockerId },
      include: { blocked: BLOCK_USER_SELECT },
      // The id tiebreaker is required for the reason findAllFollows gives:
      // usernames are unique today, but the ordering key is a joined column, and
      // an unstable tie duplicates or skips rows across page boundaries.
      orderBy: [{ blocked: { username: "asc" } }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.block.count({ where: { blockerId } }),
  ]);
};

/**
 * Removes one edge.
 *
 * deleteMany rather than delete, for the same reason deleteFollow uses it: it
 * does not throw when nothing matches. That is what makes unblock a safe
 * toggle — a client that taps twice, or retries after a dropped response, gets
 * the same 204 instead of a P2025 the error middleware would turn into a 500.
 */
export const deleteBlock = (blockerId, blockedId) => {
  return prisma.block.deleteMany({ where: { blockerId, blockedId } });
};

/**
 * "Unblock everyone".
 *
 * Scoped on blockerId ONLY, and never on blockedId. Deleting the rows where this
 * user is the blocked party would let anyone clear themselves out of everyone
 * else's block list, which is the single worst write this table could offer.
 */
export const deleteBlocksByBlocker = (blockerId) => {
  return prisma.block.deleteMany({ where: { blockerId } });
};

/**
 * Everyone who has blocked this user — for cache invalidation, not for reading.
 *
 * Used by collectUserVersionKeys in user.service.js. A block list embeds each
 * blocked user's username and avatarUrl, so renaming a user makes every list
 * they appear in stale — and they appear in the list of everyone who blocks them.
 *
 * ONE indexed read where findFollowCounterpartIdsByUser needs two, and the
 * asymmetry is load-bearing rather than an omission. Follows have two public
 * lists, so a rename is stale on both sides of every edge. Blocks have one
 * readable list, on the blocker's side, so only the blockers of a renamed user
 * need bumping. Do not "fix" this to read both directions: the second read would
 * compute cache keys for a surface that does not exist.
 *
 * WARNING: this returns the ids of people who blocked a user, which is precisely
 * the fact the API withholds from that user. It is for bumping counters and
 * nothing else — no route may return this, or anything derived from it, to a
 * caller.
 *
 * Selects the single column invalidation needs rather than whole rows, and is
 * served by @@index([blockedId]). No distinct and no orderBy: bumpVersions
 * de-duplicates via a Set already.
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export const findBlockerIdsByBlockedUser = async (userId) => {
  const blockers = await prisma.block.findMany({
    where: { blockedId: userId },
    select: { blockerId: true },
  });

  return blockers.map(({ blockerId }) => blockerId);
};

/**
 * Is there a block between these two users, in EITHER direction?
 *
 * The one function in this file that is not scoped to a single blocker, because
 * it answers a question about a PAIR rather than reading anybody's list. Its only
 * caller is followUser in follow.service.js, which must refuse an edge whichever
 * way the block points — otherwise a blocked user re-follows a second later and
 * the whole feature is inert.
 *
 * Returns the blockerId rather than a bare boolean, and that is what lets the
 * caller pick its status code without a second query: the blocker already knows
 * they blocked someone and can be told plainly, while the blocked party must be
 * told nothing that distinguishes a block from an unknown id. Nothing else about
 * the row is selected.
 *
 * findFirst with an OR rather than two findUniques: at most one row can match in
 * practice, both orderings are served by an index, and one round trip on the
 * follow hot path is worth more than the marginally better plan two reads would
 * get. This is the opposite call to findFollowCounterpartIdsByUser, which spans
 * potentially thousands of rows per side.
 *
 * @param {string} userA
 * @param {string} userB
 * @returns {Promise<{ blockerId: string } | null>}
 */
export const findBlockBetween = (userA, userB) => {
  return prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userA, blockedId: userB },
        { blockerId: userB, blockedId: userA },
      ],
    },
    select: { blockerId: true },
  });
};
