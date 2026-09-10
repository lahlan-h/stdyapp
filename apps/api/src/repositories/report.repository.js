import { prisma } from "@stdyapp/core";

/**
 * Every read in this file is scoped to ONE reporter, and that is the privacy
 * model rather than a coincidence of the routes that exist today.
 *
 * Note the absence of a findReportsByTargetUser or findReportsByPost twin. Every
 * public repository here has one — findLikesByPost, findCommentsByPost — because
 * those lists belong to everyone. The missing functions ARE the feature: "who
 * reported this person" is the exact fact this entity withholds, and it withholds
 * it from the reported party above all. See the authorisation note in
 * report.service.js.
 *
 * The two by-target functions at the foot of this file are the deliberate
 * exception, and they exist for cache invalidation only. They return reporter ids
 * and nothing else, and no route may return what they read.
 */

/**
 * The embedded target, and the reason the fan-outs in post.service.js and
 * user.service.js both had to grow a report walk.
 *
 * A bare row of {id, reporterId, targetUserId, targetPostId, reason, status} is
 * useless to a client rendering "my reports" — it would have to re-fetch every
 * target one at a time, and for a reported user it could not fetch anything at
 * all without a second privileged call. Including them is what makes the list a
 * list.
 *
 * The user half is the {id, username, avatarUrl} allowlist every joined user in
 * this API uses — never `targetUser: true`, which would ship email and
 * passwordHash. The post half is a partial Post rather than the whole row that
 * findBookmarksByUser includes: a report needs enough to show WHAT was reported,
 * and the session and routine links are somebody's study history rather than part
 * of the accusation.
 *
 * Both halves embed columns no report counter tracks, which is the coherence hole
 * the report block in utils/cache.js documents and the two fan-outs close. Any
 * FUTURE field added here from a table no counter covers reopens it.
 */
const REPORT_TARGET_INCLUDE = {
  targetUser: { select: { id: true, username: true, avatarUrl: true } },
  targetPost: {
    select: {
      id: true,
      userId: true,
      caption: true,
      photoUrl: true,
      createdAt: true,
    },
  },
};

/**
 * Writes exactly one target and NULLs the other.
 *
 * The ?? null is load-bearing rather than defensive. createReportSchema marks
 * both fields optional, so the absent one arrives as `undefined` — and Prisma
 * treats `undefined` as "leave this field out of the statement" rather than "set
 * it to NULL". On a create that happens to reach the same result, but relying on
 * it would make the update path and this one behave differently for the same
 * input, and the reports_target_xor CHECK is the thing that would notice.
 */
export const createReport = ({
  reporterId,
  targetUserId,
  targetPostId,
  reason,
}) => {
  return prisma.report.create({
    data: {
      reporterId,
      targetUserId: targetUserId ?? null,
      targetPostId: targetPostId ?? null,
      reason,
    },
    include: REPORT_TARGET_INCLUDE,
  });
};

/**
 * One report by its own id, UNSCOPED — the only read in this file that is.
 *
 * It has to be: the caller needs to tell "no such report" from "not yours", and a
 * WHERE clause that filtered by reporter would collapse both into an empty
 * result. getOwnedReportOrThrow in report.service.js is the one place allowed to
 * call this, and it applies the ownership check immediately. Nothing else may
 * reach for it — an unscoped read one layer from a route is exactly how a private
 * row gets served to a stranger.
 */
export const findReportById = (id) => {
  return prisma.report.findUnique({
    where: { id },
    include: REPORT_TARGET_INCLUDE,
  });
};

/**
 * The compound-unique lookups — "have I already reported this target?"
 *
 * Two functions rather than one because the target is polymorphic and Prisma
 * generates a separate compound-unique input per constraint. Both take a
 * NON-NULL target: the generated input types require it, and a null would be
 * asking "which report has no target", which the CHECK constraint guarantees is
 * none of them.
 *
 * The same shape as findBookmarkByUserAndPost, and for the same reason: no caller
 * knows a report's own id at the point it needs this answer. A client rendering a
 * "Report" menu item holds the target's id and its own token, which is exactly
 * this pair.
 */
export const findReportByReporterAndTargetUser = (reporterId, targetUserId) => {
  return prisma.report.findUnique({
    where: { reporterId_targetUserId: { reporterId, targetUserId } },
    include: REPORT_TARGET_INCLUDE,
  });
};

export const findReportByReporterAndTargetPost = (reporterId, targetPostId) => {
  return prisma.report.findUnique({
    where: { reporterId_targetPostId: { reporterId, targetPostId } },
    include: REPORT_TARGET_INCLUDE,
  });
};

/**
 * The caller's own reports, newest first — the only unpaginated read of this
 * table any route exposes.
 *
 * Ordered by createdAt, which this entity has where Like, Follow and Block do
 * not: findLikesByUser falls back to the liked POST's timestamp and
 * findBlocksByBlocker to a username, both under comments explaining the gap. A
 * report is a record, and a record without a date is not much of one.
 *
 * Served end to end by @@index([reporterId, createdAt]), so Postgres satisfies
 * both the filter and the sort from one index rather than sorting the matched
 * rows.
 */
export const findReportsByReporter = (reporterId) => {
  return prisma.report.findMany({
    where: { reporterId },
    include: REPORT_TARGET_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
};

/**
 * One page of the caller's OWN reports, with the totals a pager needs.
 *
 * NOTE the where clause on BOTH halves. This backs GET /api/reports/all, and that
 * path means something different here from the public routers: there it is every
 * row in the system, here it is the caller's own rows only — the call
 * findBlocksPageByBlocker and findBookmarksPageByUser both make, for a stronger
 * version of the same privacy reason. If the filter ever disappears from either
 * half, that is the bug, and this one hands out the harassment graph.
 *
 * The findMany and the count run in one transaction so the page and its total are
 * read from the same snapshot.
 *
 * The id tiebreaker is required for the reason findAllPosts, findAllLikes and
 * findBookmarksPageByUser give: createdAt is not unique — two reports filed in
 * the same millisecond tie — and an unstable tie duplicates or skips rows across
 * page boundaries.
 *
 * @returns {Promise<[object[], number]>} the page, and the caller's total
 */
export const findReportsPageByReporter = ({ reporterId, skip, take }) => {
  return prisma.$transaction([
    prisma.report.findMany({
      where: { reporterId },
      include: REPORT_TARGET_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.report.count({ where: { reporterId } }),
  ]);
};

/**
 * THE ONLY UPDATE IN THE SOCIAL HALF OF THIS API, and the reason this table has
 * an updatedAt where Like, Follow, Block and Bookmark have nothing. Those are
 * toggles: every column is the primary key or half the row's identity, so they
 * offer no edit to make. A report has a status and a reason, and both are edits.
 *
 * updateMany rather than update, and reporterId in the WHERE clause rather than
 * the id alone, even though getOwnedReportOrThrow has already checked ownership
 * by the time this runs. Two reasons:
 *
 *   - Defence in depth. The check and the write are separate statements, so the
 *     scope is re-asserted at the moment it matters rather than trusted from a
 *     read that happened earlier.
 *   - updateMany does not throw on a miss. A row deleted between the check and
 *     this call comes back as count 0, which the service turns into a 404 —
 *     where update would raise P2025 and the error middleware would render it a
 *     500.
 *
 * Returns a count rather than the row, which is what updateMany does; the service
 * re-reads through findReportById so the response carries the same embedded
 * target shape every other read returns.
 *
 * @returns {Promise<{ count: number }>}
 */
export const updateReport = (id, reporterId, data) => {
  return prisma.report.updateMany({ where: { id, reporterId }, data });
};

/**
 * deleteMany rather than delete, and scoped on reporterId as well as id, for
 * exactly the two reasons updateReport gives. The idempotency half also matters
 * on its own: a client that retries a withdrawal after a dropped response gets
 * the same 204 rather than a P2025 the error middleware would turn into a 500.
 */
export const deleteReport = (id, reporterId) => {
  return prisma.report.deleteMany({ where: { id, reporterId } });
};

/**
 * "Drop every report I have filed."
 *
 * Scoped on reporterId ONLY. There is no target-scoped bulk delete and there must
 * not be one: it would let a user clear every report filed against them, which is
 * the single worst write this table could offer — the feature would be inert for
 * exactly the people it exists to act on.
 */
export const deleteReportsByReporter = (reporterId) => {
  return prisma.report.deleteMany({ where: { reporterId } });
};

/**
 * Everyone who has reported any of these posts — for cache invalidation, not for
 * reading.
 *
 * The mirror of findBookmarkerIdsByPosts, and used the same way:
 * invalidatePostFanout in post.service.js calls it because a report payload
 * embeds the reported post's caption and photoUrl, so an edited or deleted post
 * leaves that report stale for everyone who filed one — and no report was
 * written, so nothing in report.service.js bumps.
 *
 * Takes the whole id array rather than running per-post, so clearing an account
 * with a hundred posts costs one query rather than a hundred. Selects the single
 * column invalidation needs rather than whole rows, and is served by
 * @@index([targetPostId]) — the index that exists for this caller and for
 * Postgres's own cascade, and for no route. No distinct and no orderBy:
 * bumpVersions de-duplicates via a Set already.
 *
 * Returns {reporterId} objects rather than bare ids, matching
 * findBookmarkerIdsByPosts and findLikerIdsByPosts — the by-POST convention in
 * this codebase. Its sibling below returns bare ids, matching the by-USER one.
 *
 * ⚠ This returns the ids of people who reported a post, which is precisely the
 * fact the API withholds. It is for bumping counters and nothing else — no route
 * may return this, or anything derived from it, to a caller, and least of all to
 * the post's author.
 *
 * @param {string[]} postIds
 * @returns {Promise<Array<{ reporterId: string }>>}
 */
export const findReporterIdsByPosts = (postIds) => {
  return prisma.report.findMany({
    where: { targetPostId: { in: postIds } },
    select: { reporterId: true },
  });
};

/**
 * Everyone who has reported this user — for cache invalidation, not for reading.
 *
 * The mirror of findBlockerIdsByBlockedUser, and used the same way:
 * collectUserVersionKeys in user.service.js calls it because a report payload
 * embeds the reported user's username and avatarUrl, so a rename leaves that
 * report stale in the list of everyone who filed one.
 *
 * Returns bare ids rather than rows, matching findBlockerIdsByBlockedUser and
 * findFollowCounterpartIdsByUser — the by-USER convention, and the opposite of
 * its by-POST sibling directly above. The inconsistency is the codebase's, not
 * this file's; each function matches the call site it feeds.
 *
 * ⚠ This answers "who reported me", which is the single fact this entity exists
 * to withhold — handed to the reported user it names their accusers and turns the
 * feature into a retaliation vector. It is for bumping counters and nothing else.
 *
 * @param {string} userId
 * @returns {Promise<string[]>}
 */
export const findReporterIdsByTargetUser = async (userId) => {
  const reporters = await prisma.report.findMany({
    where: { targetUserId: userId },
    select: { reporterId: true },
  });

  return reporters.map(({ reporterId }) => reporterId);
};
