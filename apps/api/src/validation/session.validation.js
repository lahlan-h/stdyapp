import { z } from "zod";

/**
 * Request schemas for the sessions resource.
 *
 * Conventions follow user.validation.js and post.validation.js: strictObject
 * everywhere, so an unrecognised key is a loud 400 rather than a silent no-op.
 *
 * Unlike post.validation.js this file covers EVERY route on the router, reads
 * included. Sessions had no schemas at all before, so there was no existing
 * hand-rolled shape to leave alone - the two id params below are the only thing
 * standing between a malformed id and a confusing 404.
 */

/**
 * A session interruption is "time the user was away from the app". 24 hours is
 * not a plausible interruption of a study session, it is a client bug or a
 * clock that jumped, and letting it through would silently apply the focus
 * penalty against a number nothing in the app can explain.
 *
 * A cap rather than a tighter guess because the honest bound is unknown: the
 * penalty threshold is 20 minutes (INTERRUPTION_PENALTY_THRESHOLD_SEC in
 * services/session.service.js), so anything past it is already "penalised" and
 * the exact value stops mattering. This only rejects the absurd.
 */
const MAX_INTERRUPTION_SEC = 24 * 60 * 60;

/**
 * sessions.id is TEXT in Postgres rather than a native uuid column, so an
 * invalid id would otherwise just miss and return a confusing 404. Validating
 * the shape here upgrades that to a 400 that says what is actually wrong - the
 * same reasoning as postIdParamSchema.
 */
export const sessionIdParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
});

/**
 * POST /api/sessions.
 *
 * userId is ABSENT by design and strictObject makes that enforced rather than
 * merely undocumented: the controller takes it from req.user.id, and a
 * client-supplied one would let any caller open a session on someone else's
 * account. Same reasoning that keeps avatarUrl out of createUserSchema.
 *
 * inviteCode is absent for the same reason - startSession generates it, and a
 * caller-chosen one could collide with a real group session's code. It is
 * @unique in the schema, so a collision is a 500 from a Prisma P2002 rather
 * than anything the error middleware translates.
 *
 * groupId is .nullish() rather than .optional() because the controller already
 * writes `groupId ?? null`: both spellings of "solo session" were accepted
 * before this schema existed and rejecting one now would be a breaking change
 * for no gain.
 */
export const startSessionSchema = z.strictObject({
  groupId: z.uuid("groupId must be a UUID").nullish(),
});

/**
 * POST /api/sessions/:id/interruptions.
 *
 * Replaces the hand-rolled check in session.controller.js, which tested
 * `typeof durationSec !== "number" || durationSec < 0`. That let a FRACTIONAL
 * and a non-finite value through - `durationSec: 0.5` and `durationSec: 1e400`
 * both pass a typeof test - and the column is an Int, so the first is silently
 * rounded by Postgres and the second is a 500.
 *
 * .int() and the max close both. z.number() already rejects NaN and Infinity.
 */
export const addInterruptionSchema = z.strictObject({
  durationSec: z
    .number()
    .int("durationSec must be a whole number of seconds")
    .min(0, "durationSec must not be negative")
    .max(
      MAX_INTERRUPTION_SEC,
      `durationSec must be at most ${MAX_INTERRUPTION_SEC} (24 hours)`,
    ),
});