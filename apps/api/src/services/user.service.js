import bcrypt from "bcryptjs";
import { prisma } from "@stdyapp/core";
import { HttpError } from "../utils/httpError.js";
import { toHttpError } from "../utils/prismaError.js";
// Cross-domain reads, for cache invalidation only — see invalidateUserFanout.
// Repository rather than service imports, matching how post.service.js reaches
// for findCommenterIdsByPosts: going through the services would drag their
// ownership gates along, and this is a cache concern rather than an access one.
import { findCommentTargetsByUser } from "../repositories/comment.repository.js";
import { findLikeTargetsByUser } from "../repositories/like.repository.js";
import {
  bumpVersions,
  userProfileVersionKey,
  userVersionKey,
  likeUserVersionKey,
  postVersionKey,
  likePostVersionKey,
} from "../utils/cache.js";

/**
 * Users domain logic.
 *
 * This layer owns POLICY - how a password becomes a hash, what a page looks
 * like, and which columns are allowed to leave the database. @stdyapp/core owns
 * the connection and knows nothing about HTTP; controllers own status codes and
 * know nothing about Prisma.
 *
 * This is deliberately the ONLY module in apps/api that touches prisma.user, so
 * the field allowlist below cannot be bypassed by accident.
 */

// OWASP's floor is 10; 12 is the current common recommendation and costs
// roughly 300-400ms under bcryptjs. Lower it to 10 only if dev latency bites.
const BCRYPT_COST_FACTOR = 12;

const USER_NOT_FOUND = "User not found";
const USER_HAS_SESSIONS =
  "This user still has study sessions and cannot be deleted";

/**
 * The ONLY shape of a user that leaves this service.
 *
 * A select allowlist beats the two alternatives:
 *
 *  - vs. Prisma's `omit` (which IS available in Prisma 6): omit is fail-OPEN.
 *    The day someone adds `mfaSecret` or `passwordResetToken` to the model,
 *    omit silently starts leaking it while select silently keeps excluding it.
 *    Fail-closed is the only defensible default for secrets.
 *
 *  - vs. a toPublicUser(user) mapper: with select, the hash never leaves
 *    Postgres at all. A mapper still pulls it into process memory, where a
 *    stray console.log(user), an error report or a debugging JSON.stringify can
 *    spill it. Data you never fetched cannot leak.
 *
 * A future login flow does its own explicit select: { id: true,
 * passwordHash: true } - deliberate, and greppable.
 */
const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  bio: true,
  lastActiveAt: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * Maps validated input onto Prisma's `data`, hashing a password if one is
 * present.
 *
 * Fields are copied explicitly rather than spread. Even though the Zod schema
 * is strict, an explicit allowlist makes it structurally impossible for a
 * request to set passwordHash, id, createdAt or lastActiveAt - defence in
 * depth, one line each.
 *
 * @param {object} input - output of createUserSchema or updateUserSchema
 * @returns {Promise<object>} a Prisma `data` object
 */
const buildUserData = async (input) => {
  const data = {};

  if (input.email !== undefined) data.email = input.email;
  if (input.username !== undefined) data.username = input.username;
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
  if (input.bio !== undefined) data.bio = input.bio;

  if (input.password !== undefined) {
    // Async, never hashSync: bcryptjs's sync path blocks Node's single thread
    // for the full ~350ms at cost 12, stalling every other in-flight request
    // including /api/health. The async path yields via setImmediate.
    data.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST_FACTOR);
  }

  return data;
};

/**
 * Collects the version keys for every cached payload that embeds this user.
 *
 * The mirror image of invalidatePostFanout in post.service.js, pointed the other
 * way, and it exists because the fan-out is genuinely two-sided. Three of these
 * scopes are the user's own; the other two are not, and those are the ones that
 * make this more than a one-line bump:
 *
 *  - postVersionKey per post they have COMMENTED on. The cached comment thread
 *    embeds each author's username and avatarUrl, so a renamed user is stale in
 *    every thread they appear in, not just in their own comment list.
 *  - likePostVersionKey per post they have LIKED, for the same reason: the
 *    liked-by list carries the liker's username and avatarUrl.
 *
 * No post scope. Post payloads are bare Post rows with no embedded user fields
 * (see the postKey block in utils/cache.js), so nothing there can go stale.
 *
 * SPLIT from the bump rather than doing both, because deleteUser has to read
 * these BEFORE the delete — afterwards the comment and like rows it reads from
 * are gone, and the fan-out would silently shrink to nothing.
 *
 * @param {string} userId
 * @returns {Promise<string[]>} version keys, for bumpVersions
 */
const collectUserVersionKeys = async (userId) => {
  const [comments, likes] = await Promise.all([
    findCommentTargetsByUser(userId),
    findLikeTargetsByUser(userId),
  ]);

  return [
    // The user's own scopes: their profile, their comment list, their like list.
    userProfileVersionKey(userId),
    userVersionKey(userId),
    likeUserVersionKey(userId),
    // Everywhere else they appear.
    ...comments.map(({ postId }) => postVersionKey(postId)),
    ...likes.map(({ postId }) => likePostVersionKey(postId)),
  ];
};

/**
 * The common case: read the scopes and bump them in one step.
 *
 * MUST be awaited AFTER the database write resolves, never before or
 * concurrently — bumpVersions' own doc block explains why bumping first lets a
 * reader cache the pre-write body under the post-write key, where it would sit
 * for the whole TTL. Awaited rather than fired and forgotten so a client that
 * reads straight back after writing cannot observe what it just invalidated.
 *
 * Cannot fail a write: bumpVersions swallows its own Redis errors, so an outage
 * costs a bump and leaves entries stale until their TTL lapses rather than
 * turning a successful 200 into a 500.
 *
 * @param {string} userId
 */
const invalidateUserFanout = async (userId) => {
  await bumpVersions(await collectUserVersionKeys(userId));
};

/**
 * @param {object} input - validated create body
 * @returns {Promise<object>} the created user, without passwordHash
 */
export const createUser = async (input) => {
  const data = await buildUserData(input);

  try {
    // No invalidation, deliberately rather than by omission: nothing can be
    // cached under an id that did not exist a moment ago, and the one list this
    // user now appears in — GET /api/users — is uncached by design.
    return await prisma.user.create({ data, select: USER_PUBLIC_SELECT });
  } catch (err) {
    // P2002 on the email or username unique index.
    throw toHttpError(err);
  }
};

/**
 * Returns one page of users plus the total, so the controller can compute
 * pagination without a second round trip.
 *
 * @param {{ page: number, limit: number, q?: string }} query - validated
 * @returns {Promise<{ items: object[], total: number, page: number, limit: number }>}
 */
export const listUsers = async ({ page, limit, q }) => {
  // Deliberately NOT searching email: matching on it would turn this
  // unauthenticated endpoint into an account-enumeration oracle
  // ("is alice@uts.edu.au registered here?").
  const where = q
    ? {
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      }
    : undefined;

  // One transaction so the page and the total agree even under concurrent
  // writes. A batch $transaction([...]) is safe through PgBouncer's transaction
  // pooling - it is prepared statements and session state that break there,
  // which is exactly what ?pgbouncer=true in DATABASE_URL already disables.
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: USER_PUBLIC_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total, page, limit };
};

/**
 * @param {string} id
 * @returns {Promise<object>} the user, without passwordHash
 * @throws {HttpError} 404 when no such user exists
 */
export const getUserById = async (id) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: USER_PUBLIC_SELECT,
  });

  // Thrown here rather than in the controller so that this 404 and the one
  // Prisma raises as P2025 on update/delete are produced in one place.
  if (!user) throw new HttpError(404, USER_NOT_FOUND);

  return user;
};

/**
 * @param {string} id
 * @param {object} input - validated update body, at least one field
 * @returns {Promise<object>} the updated user, without passwordHash
 */
export const updateUser = async (id, input) => {
  const data = await buildUserData(input);

  let user;
  try {
    user = await prisma.user.update({
      where: { id },
      data,
      select: USER_PUBLIC_SELECT,
    });
  } catch (err) {
    // P2025 when the row is gone, P2002 on a duplicate email/username.
    throw toHttpError(err, { notFoundMessage: USER_NOT_FOUND });
  }

  // AFTER the write resolves and OUTSIDE the try, so a failed update bumps
  // nothing and a bump can never be mistaken for a Prisma error.
  await invalidateUserFanout(id);

  return user;
};

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export const deleteUser = async (id) => {
  // Read the invalidation scopes BEFORE the delete, the same read-first shape
  // deleteMyPosts uses in post.service.js. Afterwards this user's comment and
  // like rows are gone, so the two lookups would come back empty and the
  // fan-out would silently shrink to the three own-scope keys — leaving every
  // thread they commented in serving a deleted user for the full TTL.
  //
  // Wasted only when the delete then fails, which is the cheap direction to be
  // wrong: two indexed reads against a 409 that a caller can hit at most five
  // times an hour.
  const versionKeys = await collectUserVersionKeys(id);

  try {
    // sessions.userId is ON DELETE RESTRICT (see the init migration), so this
    // throws P2003 - not P2025 - for any user who has ever studied. Without
    // mapping that, the most ordinary delete in the app would return a 500.
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    throw toHttpError(err, {
      notFoundMessage: USER_NOT_FOUND,
      conflictMessage: USER_HAS_SESSIONS,
    });
  }

  // The profile bump is the one that matters most here: without it a deleted
  // user stays readable from GET /api/users/:id for the whole TTL.
  await bumpVersions(versionKeys);
};
