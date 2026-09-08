import { z } from "zod";

/**
 * Report request schemas.
 *
 * Zod throughout, following bookmark.validation.js rather than the hand-rolled
 * `isId` helpers still living in like.controller.js and block.controller.js.
 * Those predate this middleware; nothing new should grow a third copy of a uuid
 * check.
 *
 * strictObject everywhere, for the reason paginationQuerySchema gives — an
 * unrecognised field is almost always a client bug, and one that silently does
 * nothing is far harder to diagnose than a 400 naming it. On this resource it
 * also does security work: see createReportSchema.
 */

/**
 * The reasons a report may be filed.
 *
 * A Zod enum over a Postgres TEXT column rather than a Prisma enum like
 * GroupRole, and the split is deliberate. A moderation vocabulary is the most
 * churn-prone list in a product like this, and every addition to a Postgres enum
 * is a migration. Closing the set HERE keeps the API strict while leaving the
 * column free to grow one — and this layer is the only one a client can reach,
 * so nothing is actually lost.
 *
 * Exported so report.service.js and any future moderation tooling read the list
 * rather than re-declaring it. A second copy is a second thing to forget.
 */
export const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "HATE_SPEECH",
  "NUDITY",
  "MISINFORMATION",
  "SELF_HARM",
  "OTHER",
];

/**
 * The lifecycle states a report can be in.
 *
 * THE FULL VOCABULARY, NOT the set a reporter may choose from. Only PENDING and
 * WITHDRAWN are reachable through this API today — the other three are moderator
 * verdicts, and there is no moderator role in this codebase.
 *
 * That restriction lives in REPORTER_ALLOWED_STATUSES in report.service.js and
 * nowhere else, which is the point of listing all five here: granting a moderator
 * the remaining transitions later is then one edit to one constant in one
 * function, rather than a schema migration plus a validation change plus a
 * service change.
 */
export const REPORT_STATUSES = [
  "PENDING",
  "WITHDRAWN",
  "REVIEWED",
  "ACTIONED",
  "DISMISSED",
];

// The report's own id, for the four routes keyed on it. This router is the first
// in the social half of the API to have a "/:id" at all — see the note at the top
// of report.routes.js for why, and for the declaration-order trap it brings.
export const reportIdParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
});

export const reportUserParamSchema = z.strictObject({
  userId: z.uuid("userId must be a UUID"),
});

export const reportPostParamSchema = z.strictObject({
  postId: z.uuid("postId must be a UUID"),
});

/**
 * POST /api/reports.
 *
 * NOTE WHAT IS ABSENT, because strictObject turns each omission into a 400 rather
 * than a silent ignore:
 *
 *   reporterId — always the token holder. Accepting one would let any caller file
 *                a report in somebody else's name, which is the worst write this
 *                table could offer.
 *   status     — always the schema default, PENDING. Accepting one would let a
 *                client file a report pre-marked DISMISSED, or ACTIONED.
 *
 * THE XOR IS ENFORCED IN THREE PLACES and this is the one that produces a usable
 * error. The database CHECK in the add_reports migration is the one that cannot
 * be bypassed; fileReport in report.service.js re-checks because a service must
 * hold its own invariants for callers that are not HTTP requests.
 *
 * `.refine` rather than a union of two strictObjects: the union would report
 * "expected targetUserId" and "expected targetPostId" as two competing failures
 * and leave the client to work out that it needed exactly one. One message says
 * the actual rule.
 *
 * The path is set to targetUserId so the issue lands on a field rather than at
 * the object root, where validate.js would have to fall back to naming the whole
 * body.
 */
export const createReportSchema = z
  .strictObject({
    targetUserId: z.uuid("targetUserId must be a UUID").optional(),
    targetPostId: z.uuid("targetPostId must be a UUID").optional(),
    reason: z.enum(REPORT_REASONS),
  })
  .refine(
    (body) => Boolean(body.targetUserId) !== Boolean(body.targetPostId),
    {
      message:
        "exactly one of targetUserId or targetPostId must be provided",
      path: ["targetUserId"],
    },
  );

/**
 * PATCH /api/reports/:id.
 *
 * The only update schema in the social half of this API, because a report is the
 * only one of these entities with a column worth editing — Like, Follow, Block
 * and Bookmark are toggles whose every column is the primary key or half the
 * row's identity. See the note at the foot of report.routes.js.
 *
 * NEITHER TARGET IS ACCEPTED, and strictObject makes that a 400. Rewriting
 * targetUserId or targetPostId would not EDIT a report, it would make it a
 * different accusation about a different person — which is a delete plus a
 * create, and must go through the unique constraint like any other create. It is
 * the same reasoning block.routes.js and follow.routes.js give for having no
 * PATCH at all.
 *
 * Both fields optional, plus a refine rejecting the empty body: without it, an
 * empty PATCH would spend a write, bump a cache counter and return an unchanged
 * row, which is a silent no-op dressed as a success.
 */
export const updateReportSchema = z
  .strictObject({
    reason: z.enum(REPORT_REASONS).optional(),
    status: z.enum(REPORT_STATUSES).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "at least one of reason or status must be provided",
  });
