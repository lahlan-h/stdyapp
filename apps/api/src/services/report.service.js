import * as reportRepo from "../repositories/report.repository.js";
// The only sanctioned way to reach prisma.user from here: user.service.js
// declares itself the sole module in apps/api that touches that table, so its
// column allowlist cannot be bypassed by accident. It also already throws the 404
// this module wants. Same call block.service.js makes for the same check.
import { getUserById } from "./user.service.js";
// Cross-domain repository import, precedented by like.service.js and
// bookmark.service.js both reaching for post.repository.js: the existence check
// below needs posts, and going through post.service.js would drag its ownership
// gate along — a gate that is wrong here, since the whole point is to report
// OTHER people's posts.
import { findPostById } from "../repositories/post.repository.js";
// The shared duck-typing helper. toHttpError from the same module is deliberately
// NOT reused, for the reason like.service.js and bookmark.service.js both give:
// it returns HttpError, its P2002 message would read "That value is already in
// use" for a repeat report, and it maps P2003 to a 409 when a bad targetPostId is
// plainly a 404.
import { isPrismaError } from "../utils/prismaError.js";
import { bumpVersions, reportUserVersionKey } from "../utils/cache.js";

/**
 * AUTHORIZATION MODEL — block.service.js's privacy, taken one step further, and
 * the step is the whole point of this module.
 *
 * block.service.js says reads and writes share one scope: the blocker's own. So
 * does this one, with the reporter in that role —
 *
 *   READS ARE SCOPED TOO. Every function here pins reporterId to the caller's own
 *   id from the access token. There is exactly ONE write scope and exactly ONE
 *   read scope, and they are the same scope. No function may take a reporterId
 *   from the path or the body, on a read or on a write.
 *
 * WHAT MAKES THIS STRICTER THAN BLOCKS. A block is private but inert: knowing
 * someone blocked you costs you nothing you can act on. A report is an
 * ACCUSATION, and the accused learning it exists is a retaliation vector — it
 * tells them who to go after and exactly when. So:
 *
 *   NOBODY LEARNS THEY HAVE BEEN REPORTED. There is no "reports against me"
 *   list, no report count on a post or a profile, no notification, and no route
 *   from which any of them can be derived. Anything that lets a caller INFER the
 *   answer — a count that moves, a list that shrinks, a status route that answers
 *   differently for a reported user — is the same leak wearing a hat.
 *
 * GET /api/reports/all is scoped to the caller, unlike the /all route in the
 * public routers and exactly like the ones in block.service.js and
 * bookmark.service.js. There is no admin role in this codebase, so a global
 * report list would hand the entire harassment graph to any authenticated caller.
 *
 * ⚠ THE OWNERSHIP CHECK THAT BLOCKS AND BOOKMARKS DO NOT NEED. Those two are
 * addressed by their target — DELETE /api/bookmarks/post/:postId — so the WHERE
 * clause IS the authorisation and no read-then-check is possible or needed. This
 * router is addressed by the ROW's own id, because a report is a record a user
 * refers back to. That makes getOwnedReportOrThrow load-bearing, and it is why
 * this module has a forbidden() helper where bookmark.service.js explicitly does
 * not.
 *
 * The consequences, stated as choices rather than oversights:
 *   - Reporting yourself, or your own post, is REFUSED. Unlike saving your own
 *     post, which bookmark.service.js allows because people really do it, there
 *     is no coherent thing a self-report asks anyone to do.
 *   - A reported user may NOT delete the report. Only the reporter withdraws it.
 *   - Nothing here reads the target side of the table. The two repository
 *     functions that do are for cache invalidation and are called from
 *     post.service.js and user.service.js, never from a route.
 */

const notFound = (what) => {
  const err = new Error(`${what} not found`);
  err.status = 404;
  return err;
};

const badRequest = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

const forbidden = (message) => {
  const err = new Error(message);
  err.status = 403;
  return err;
};

const PRISMA_UNIQUE_VIOLATION = "P2002";
const PRISMA_FOREIGN_KEY_VIOLATION = "P2003";

const STATUS_PENDING = "PENDING";
const STATUS_WITHDRAWN = "WITHDRAWN";

/**
 * THE MODERATION SEAM, and the single place the transition rule lives.
 *
 * report.validation.js accepts all five states in REPORT_STATUSES; this narrows
 * them to the two a REPORTER can legitimately reach. The other three — REVIEWED,
 * ACTIONED, DISMISSED — are verdicts, and a verdict from the person who filed the
 * complaint is not a verdict. There is no moderator role in this codebase to
 * issue one yet.
 *
 * Deliberately NOT enforced in the Zod schema, which would be the obvious place.
 * Keeping the full vocabulary at the edge and the restriction here means adding a
 * moderator later is one edit to one function: the gate below grows a "unless the
 * caller is a moderator" clause, and nothing about the schema, the column or the
 * migration changes. Folding it into the schema would scatter the same decision
 * across three files.
 */
const REPORTER_ALLOWED_STATUSES = [STATUS_PENDING, STATUS_WITHDRAWN];

/**
 * Re-states the XOR the database CHECK and createReportSchema both enforce.
 *
 * A third copy, and worth it: a service must hold its own invariants for callers
 * that are not HTTP requests, and this is the layer a future job or admin script
 * would come through. The other two are not redundant either — the CHECK is the
 * one that cannot be bypassed, and the schema is the one that can name the field.
 */
const assertExactlyOneTarget = (targetUserId, targetPostId) => {
  if (Boolean(targetUserId) === Boolean(targetPostId)) {
    throw badRequest(
      "exactly one of targetUserId or targetPostId must be provided",
    );
  }
};

/**
 * Existence AND self-report checks for a reported user.
 *
 * The self check runs FIRST, so reporting yourself is a 400 rather than whatever
 * the existence check would say — the ordering block.service.js uses for the same
 * pair, and for the same reason: your own id certainly exists, so a check in the
 * other order would pass and leave the useless row to be refused a line later
 * with a worse message.
 *
 * The existence half is not optional. Without it a bad targetUserId reaches
 * Postgres and comes back as a P2003 foreign-key violation, which nothing in the
 * error middleware translates — the client would get a 500 for what is plainly a
 * bad request. getUserById already throws a 404, so this costs one query and no
 * error handling.
 */
const assertReportableUser = async (targetUserId, reporterId) => {
  if (targetUserId === reporterId) {
    throw badRequest("You cannot report yourself");
  }

  await getUserById(targetUserId);
};

/**
 * The same pair for a reported post, with the self check pointed at the AUTHOR.
 *
 * Here the existence check has to run first, because the ownership half cannot be
 * answered without the row. That is the reverse of assertReportableUser above and
 * is forced by the data rather than chosen.
 *
 * Refusing to report your own post is the deliberate counterpart to
 * bookmark.service.js explicitly ALLOWING you to save your own: saving your own
 * post is a real thing people do, reporting it asks a moderator to act against
 * yourself. Deleting it is the operation that was wanted.
 */
const assertReportablePost = async (targetPostId, reporterId) => {
  const post = await findPostById(targetPostId);
  if (!post) throw notFound("Post");

  if (post.userId === reporterId) {
    throw badRequest("You cannot report your own post");
  }

  return post;
};

/**
 * Invalidates every cached read a report write can affect.
 *
 * ONE BUMP, and one END of one edge — the call invalidateBlock makes rather than
 * the two invalidateLike needs. A report changes exactly one readable surface:
 * the reporter's own list, their own paginated page, the single report, and their
 * own reportedByMe flags. Nothing anyone else can read changes at all, because
 * nothing anyone else can read contains these rows.
 *
 * Bumping a target-scoped counter would therefore invalidate nothing, and — far
 * worse as documentation — would imply the reported side has a surface that
 * observes this. It does not, and must not acquire one.
 *
 * Nothing here can fail a write. bumpVersions swallows its own Redis errors, so
 * an outage costs a bump and leaves entries stale until their TTL lapses; it
 * never turns a successful 201 into a 500.
 *
 * Awaited rather than fired and forgotten, so a client that reads straight back
 * after writing cannot observe the version it just invalidated.
 *
 * @param {string} reporterId
 */
const invalidateReport = async (reporterId) => {
  await bumpVersions([reportUserVersionKey(reporterId)]);
};

/**
 * Reads one report and proves it belongs to the caller.
 *
 * The function bookmark.service.js has no equivalent of, and the reason is in
 * this module's authorisation note: this router addresses rows by their own id,
 * so the WHERE clause cannot be the authorisation on its own.
 *
 * 404 for absent and 403 for somebody else's, matching getOwnedPostOrThrow and
 * getOwnedSessionOrThrow. The alternative — 404 for both, hiding existence — buys
 * very little here, since report ids are uuids that only their author has ever
 * seen, and it would break the pattern every other owned resource in this API
 * follows. If a moderator role ever makes these ids guessable or shareable, this
 * is the function to revisit.
 */
const getOwnedReportOrThrow = async (reportId, reporterId) => {
  const report = await reportRepo.findReportById(reportId);
  if (!report) throw notFound("Report");
  if (report.reporterId !== reporterId) throw forbidden("You don't have access to this report");
  return report;
};

/** Which of the two compound uniques applies to this report. */
const findExistingReport = (reporterId, targetUserId, targetPostId) =>
  targetUserId
    ? reportRepo.findReportByReporterAndTargetUser(reporterId, targetUserId)
    : reportRepo.findReportByReporterAndTargetPost(reporterId, targetPostId);

/**
 * Files a report, idempotently.
 *
 * A repeat report is NOT a 409, for the reason saveBookmark and likePost both
 * spell out: it arrives twice from a double-tapped menu item, from a retry on a
 * flaky connection, and from an app resumed with stale state. A 409 would force
 * every client to write "if 409, treat as success" — a branch that exists only to
 * undo the API's unhelpfulness, and one some client will forget.
 *
 * A repeat report does NOT move createdAt, which is what makes that retry free: a
 * client cannot silently re-date its own accusation by firing twice.
 *
 * THE ONE PLACE THIS DIVERGES FROM saveBookmark is the WITHDRAWN branch. A
 * bookmark that is deleted is gone, so re-saving is an ordinary create. A
 * withdrawn report is still a row, and the unique constraint means it stands
 * between the reporter and ever reporting that target again — so withdrawing once
 * would permanently disarm the feature for that pair. Reopening is the only
 * alternative to that dead end short of making withdrawal a delete, which would
 * throw away the record this entity exists to keep.
 *
 * The reason is overwritten on reopen rather than preserved: the reporter is
 * filing again, now, and it is the new complaint that matters.
 *
 * `created` lets the controller answer 201 or 200 without the caller having to
 * care which of the three paths ran.
 *
 * @returns {Promise<{ report: object, created: boolean }>}
 */
export const fileReport = async ({
  reporterId,
  targetUserId,
  targetPostId,
  reason,
}) => {
  assertExactlyOneTarget(targetUserId, targetPostId);

  if (targetUserId) {
    await assertReportableUser(targetUserId, reporterId);
  } else {
    await assertReportablePost(targetPostId, reporterId);
  }

  const existing = await findExistingReport(reporterId, targetUserId, targetPostId);

  if (existing) {
    // Still open, so nothing changed and nothing needs invalidating — the cheap
    // path stays cheap, and createdAt stays where it was.
    if (existing.status !== STATUS_WITHDRAWN) {
      return { report: existing, created: false };
    }

    // Withdrawn, so the row is in the way of a genuine new complaint. Reopen it
    // in place rather than deleting and re-creating: the id, the createdAt and
    // the history stay put, and updatedAt records that this happened.
    await reportRepo.updateReport(existing.id, reporterId, {
      status: STATUS_PENDING,
      reason,
    });
    const reopened = await reportRepo.findReportById(existing.id);
    await invalidateReport(reporterId);
    return { report: reopened, created: false };
  }

  try {
    const report = await reportRepo.createReport({
      reporterId,
      targetUserId,
      targetPostId,
      reason,
    });
    await invalidateReport(reporterId);
    return { report, created: true };
  } catch (err) {
    // Two taps landing between the read above and this insert. The unique
    // constraint is what makes that race safe: re-read, and report it as the
    // no-op it is rather than as a conflict.
    if (isPrismaError(err, PRISMA_UNIQUE_VIOLATION)) {
      const report = await findExistingReport(reporterId, targetUserId, targetPostId);
      // Bumped even though `created` is false. Unlike the early return above, a
      // row genuinely WAS inserted here — by the request that won the race. Its
      // own bump covers this, but bumping twice only orphans a key, while missing
      // one serves a stale list for the whole TTL.
      if (report) {
        await invalidateReport(reporterId);
        return { report, created: false };
      }
    }
    // The target was deleted inside that same window. The checks above were
    // honest when they ran, so this is still a 404 rather than a 500.
    if (isPrismaError(err, PRISMA_FOREIGN_KEY_VIOLATION)) {
      throw notFound(targetUserId ? "User" : "Post");
    }
    throw err;
  }
};

/**
 * One of the caller's own reports.
 *
 * The ownership gate is the whole of the authorisation — see
 * getOwnedReportOrThrow, and the note at the top of this file for why this router
 * needs one where blocks and bookmarks do not.
 */
export const getMyReport = async (reportId, reporterId) => {
  return getOwnedReportOrThrow(reportId, reporterId);
};

/**
 * The caller's own filed reports.
 *
 * No ownership gate is needed and none exists: reporterId is the caller's own id
 * from the access token. There is deliberately no listReportsByUser counterpart —
 * the function like.service.js has for reading anyone's likes. Adding one would
 * publish an accusation, so it is not missing pending implementation.
 */
export const listMyReports = async (reporterId) => {
  return reportRepo.findReportsByReporter(reporterId);
};

/**
 * One page of the CALLER'S OWN reports.
 *
 * Backs GET /api/reports/all, whose path means something different here from the
 * public routers: there it is every row in the system, here it is the caller's
 * own rows. The reporterId below is what makes the two differ — it is passed
 * straight through to the repository as the WHERE clause on both the page and its
 * count. If it ever stops being passed, this route silently becomes the thing it
 * is named after, and that thing is the harassment graph.
 *
 * Returns the { items, total, page, limit } shape every paginated service in this
 * API returns, so the controller's envelope is the shared one.
 */
export const listMyReportsPage = async ({ reporterId, page, limit }) => {
  const [items, total] = await reportRepo.findReportsPageByReporter({
    reporterId,
    skip: (page - 1) * limit,
    take: limit,
  });

  return { items, total, page, limit };
};

/**
 * Everything a "Report" menu item needs for a USER target, in one round trip.
 *
 * Named a status rather than a summary, matching getBlockStatus and
 * getBookmarkStatus rather than getLikeSummary: there is no count here and there
 * must never be one. A report count on a profile is the exact fact this entity
 * withholds, and it would leak by MOVING even if it were never read directly.
 *
 * Returns the report's id and status alongside the flag because they come from
 * the same row and a client offering "Withdraw" would otherwise need a second
 * call. null for both when unreported, so the shape is stable either way.
 *
 * The existence check is kept for the reason getBookmarkStatus keeps its own: a
 * bad id should be a 404, not a silently-false flag that a client renders as "not
 * yet reported" for a user who does not exist.
 *
 * Arg order is target-then-caller, matching getBookmarkStatus and getBlockStatus.
 */
export const getUserReportStatus = async (targetUserId, reporterId) => {
  await getUserById(targetUserId);

  const report = await reportRepo.findReportByReporterAndTargetUser(
    reporterId,
    targetUserId,
  );

  // A withdrawn report is reported: false. The row still exists — it has to, for
  // the record — but the question this route answers is "does my report stand",
  // and the answer is no. It is also what keeps the flag consistent with
  // fileReport, which will happily reopen from here.
  const isOpen = Boolean(report) && report.status !== STATUS_WITHDRAWN;

  return {
    targetUserId,
    reportedByMe: isOpen,
    status: report?.status ?? null,
    reportId: report?.id ?? null,
  };
};

/** The same for a POST target. See getUserReportStatus for all of the reasoning. */
export const getPostReportStatus = async (targetPostId, reporterId) => {
  const post = await findPostById(targetPostId);
  if (!post) throw notFound("Post");

  const report = await reportRepo.findReportByReporterAndTargetPost(
    reporterId,
    targetPostId,
  );

  const isOpen = Boolean(report) && report.status !== STATUS_WITHDRAWN;

  return {
    targetPostId,
    reportedByMe: isOpen,
    status: report?.status ?? null,
    reportId: report?.id ?? null,
  };
};

/**
 * Edits one of the caller's own reports.
 *
 * THE ONLY UPDATE IN THE SOCIAL HALF OF THIS API — see updateReport in the
 * repository for why the other five entities have none.
 *
 * The status gate is REPORTER_ALLOWED_STATUSES, and a rejected transition is a
 * 403 rather than a 400: the value is well-formed and the state is reachable, the
 * caller is simply not the kind of user who may reach it. That is the distinction
 * a 403 exists for, and it is what makes the eventual moderator role a change to
 * WHO passes rather than to WHAT is valid.
 *
 * Re-read after the write rather than returning updateMany's count, so the
 * response carries the same embedded target shape every other read returns.
 *
 * The count === 0 branch is a genuine race, not dead code: getOwnedReportOrThrow
 * and the update are separate statements, so a concurrent DELETE /api/reports/:id
 * from the same user's other device lands between them.
 */
export const updateMyReport = async (reportId, reporterId, input) => {
  await getOwnedReportOrThrow(reportId, reporterId);

  if (input.status !== undefined && !REPORTER_ALLOWED_STATUSES.includes(input.status)) {
    throw forbidden(
      `Only ${REPORTER_ALLOWED_STATUSES.join(" and ")} can be set on your own report`,
    );
  }

  const data = {};
  if (input.reason !== undefined) data.reason = input.reason;
  if (input.status !== undefined) data.status = input.status;

  const result = await reportRepo.updateReport(reportId, reporterId, data);
  if (result.count === 0) throw notFound("Report");

  const report = await reportRepo.findReportById(reportId);
  await invalidateReport(reporterId);

  return report;
};

/**
 * Deletes one of the caller's own reports.
 *
 * A hard delete, and the one operation that genuinely destroys the record. It is
 * offered anyway because CRUD on a resource a user owns should be complete, and
 * because a report filed by mistake — the wrong person, the wrong post — should
 * not be a permanent mark the reporter cannot take back. WITHDRAWN is the softer
 * option and the one a client should offer first.
 *
 * The ownership gate runs first so a stranger's report id is a 403 rather than a
 * silent 204 — deleteMany would report count 0 and say nothing, which reads
 * identically to "already deleted" and would let a caller probe for ids.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteMyReport = async (reportId, reporterId) => {
  await getOwnedReportOrThrow(reportId, reporterId);

  const result = await reportRepo.deleteReport(reportId, reporterId);

  // Only when a row actually went. count is 0 only for the race described on
  // updateMyReport, which changed nothing and must not spend a bump.
  if (result.count > 0) await invalidateReport(reporterId);

  return result;
};

/**
 * "Drop every report I have filed." No ownership check, and none is needed:
 * reporterId is always the caller's own id from the access token, so the WHERE
 * clause IS the authorisation. The route must never accept a target id from the
 * path or body — there is no admin role in this codebase, so a caller-supplied id
 * here would let anyone erase every report filed against them.
 *
 * No read-before-delete, matching deleteMyBookmarks and diverging from
 * deleteMyLikes: the one-ended counter documented on invalidateReport means there
 * are no counterparties to invalidate. Nobody else's readable surface contains
 * these rows.
 *
 * @returns {Promise<{ count: number }>}
 */
export const deleteMyReports = async (reporterId) => {
  const result = await reportRepo.deleteReportsByReporter(reporterId);

  // Nothing was deleted, so nothing is stale. Saves a round trip on the repeat
  // call this idempotent route is designed to tolerate.
  if (result.count === 0) return result;

  await invalidateReport(reporterId);

  return result;
};
