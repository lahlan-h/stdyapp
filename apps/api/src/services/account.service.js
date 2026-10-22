import { prisma } from "@stdyapp/core";

import {
  getUserById,
  collectUserVersionKeys,
  deleteUserRow,
} from "./user.service.js";
import { collectPostFanoutKeys } from "./post.service.js";
import { cancelSubscriptionNow } from "./subscription.service.js";
import { emitNotification } from "./notification.service.js";
import {
  AVATAR_PREFIX,
  POST_PREFIX,
  keyFromOwnedUrl,
  deleteManyQuietly,
} from "./photoStorage.service.js";
import { findPostRefsByUser } from "../repositories/post.repository.js";
import { findPhotosByUploader } from "../repositories/postPhoto.repository.js";
import {
  bumpVersions,
  postContentVersionKey,
  postAuthorVersionKey,
  sessionContentVersionKey,
  sessionOwnerVersionKey,
  groupContentVersionKey,
  groupMemberVersionKey,
  routineContentVersionKey,
  routineOwnerVersionKey,
  goalOwnerVersionKey,
  streakUserVersionKey,
  subscriptionUserVersionKey,
  notificationUserVersionKey,
} from "../utils/cache.js";

/**
 * Deleting an account, and everything in it.
 *
 * A module of its own because no one domain owns the job. It crosses nearly
 * every table in the schema, and the domains it crosses each own a slice of the
 * cache and storage around their rows - so this reads from them, asks them for
 * their keys, and deletes the rows in ONE transaction, which no single domain's
 * service could open across the others.
 *
 * The deletes go straight to Prisma, inside that transaction, rather than
 * through each repository's own delete: those run on the shared client, not on
 * a transaction's, and a half-deleted account - posts gone, sessions kept - is
 * the one outcome this must never leave behind. The users row itself still goes
 * through user.service.js, which is the module that touches prisma.user.
 */

/**
 * What a member of a disbanded group is told. Curly quotes around the name, as
 * the GROUP_JOIN notification has them.
 */
const disbandedMessage = (groupName) =>
  `“${groupName}” was disbanded because its owner deleted their account.`;

/**
 * Everything that has to be learnt BEFORE the delete - afterwards the rows these
 * come from are gone, or their foreign keys already NULL, and there is no way
 * left to find which caches went stale, which objects to reclaim, or whom to
 * tell. The read-first shape deleteMyPosts and deleteGroup both use, for the
 * whole account at once.
 *
 * @param {string} userId
 */
const readTeardown = async (userId) => {
  const user = await getUserById(userId);

  const [posts, photos, sessions, ownedGroups, memberships, routines] =
    await Promise.all([
      findPostRefsByUser(userId),
      findPhotosByUploader(userId),
      prisma.session.findMany({ where: { userId }, select: { id: true } }),
      prisma.studyGroup.findMany({
        where: { ownerId: userId },
        select: {
          id: true,
          name: true,
          memberships: {
            where: { userId: { not: userId } },
            select: { userId: true },
          },
        },
      }),
      prisma.groupMembership.findMany({
        where: { userId },
        select: { groupId: true },
      }),
      prisma.studyRoutine.findMany({ where: { userId }, select: { id: true } }),
    ]);

  const sessionIds = sessions.map(({ id }) => id);
  const ownedGroupIds = ownedGroups.map(({ id }) => id);
  const routineIds = routines.map(({ id }) => id);

  // Other people's rows that the delete rewrites through ON DELETE SET NULL or
  // CASCADE, with no code of theirs running: sessions that joined one of this
  // user's sessions or ran in a group they owned, posts shared to those groups,
  // and routines cloned from theirs.
  const [detachedSessions, sharedIntoOwned, clones] = await Promise.all([
    prisma.session.findMany({
      where: {
        userId: { not: userId },
        OR: [
          { hostSessionId: { in: sessionIds } },
          { groupId: { in: ownedGroupIds } },
        ],
      },
      select: { id: true, userId: true },
    }),
    prisma.postGroupShare.findMany({
      where: { groupId: { in: ownedGroupIds }, post: { userId: { not: userId } } },
      select: { post: { select: { id: true, userId: true } } },
    }),
    prisma.studyRoutine.findMany({
      where: { sourceRoutineId: { in: routineIds }, userId: { not: userId } },
      select: { id: true, userId: true },
    }),
  ]);

  const [userKeys, postKeys] = await Promise.all([
    collectUserVersionKeys(userId),
    collectPostFanoutKeys(
      posts.map(({ id }) => id),
      userId,
    ),
  ]);

  const groupIds = [...ownedGroupIds, ...memberships.map(({ groupId }) => groupId)];

  const versionKeys = [
    ...userKeys,
    ...postKeys,
    // Their own remaining scopes. Nobody else can read most of these once the
    // account is gone, but a streak and a profile's sessions are public, and a
    // bump costs nothing against a reader seeing a deleted account.
    ...sessionIds.map(sessionContentVersionKey),
    sessionOwnerVersionKey(userId),
    ...routineIds.map(routineContentVersionKey),
    routineOwnerVersionKey(userId),
    goalOwnerVersionKey(userId),
    streakUserVersionKey(userId),
    subscriptionUserVersionKey(userId),
    notificationUserVersionKey(userId),
    // Groups they owned are gone; groups they were in lost a member, which the
    // member counter covers for both the list and the group payload.
    ...groupIds.map(groupContentVersionKey),
    ...groupIds.map(groupMemberVersionKey),
    // Other people's rows, as above.
    ...detachedSessions.map(({ id }) => sessionContentVersionKey(id)),
    ...detachedSessions.map(({ userId: ownerId }) => sessionOwnerVersionKey(ownerId)),
    ...sharedIntoOwned.map(({ post }) => postContentVersionKey(post.id)),
    ...sharedIntoOwned.map(({ post }) => postAuthorVersionKey(post.userId)),
    ...clones.map(({ id }) => routineContentVersionKey(id)),
    ...clones.map(({ userId: ownerId }) => routineOwnerVersionKey(ownerId)),
  ];

  // Null for anything not in our bucket - the seeded fixtures, a third-party
  // URL - which deleteManyQuietly drops.
  const objectKeys = [
    keyFromOwnedUrl(user.avatarUrl, { prefix: AVATAR_PREFIX, ownerId: userId }),
    ...photos.map(({ url }) => keyFromOwnedUrl(url, { prefix: POST_PREFIX, ownerId: userId })),
  ];

  // De-duplicated per recipient AND group, never across groups: someone in two
  // of the groups is told about each.
  const disbanded = ownedGroups.flatMap(({ name, memberships: members }) =>
    members.map(({ userId: memberId }) => ({ memberId, name })),
  );

  return { versionKeys, objectKeys, disbanded };
};

/**
 * Deletes an account and all of its data. The caller has already proved
 * ownership - see verifyAccountOwner in auth.service.js.
 *
 * ORDER, none of it arbitrary:
 *
 *   read  ->  cancel Stripe  ->  delete, in one transaction
 *     ->  bump caches  ->  reclaim storage  ->  tell group members
 *
 * Stripe goes BEFORE the delete, and a failure there stops everything: an
 * account that is gone while still being billed is worse than one that is not
 * gone yet, and the second is fixed by trying again.
 *
 * Inside the transaction, the order clears the seven ON DELETE RESTRICT foreign
 * keys to users - comments, posts, focus ratings, sessions, owned groups,
 * memberships, routines - before the user row, whose delete cascades the rest.
 *
 * Everything after the commit is best-effort and cannot undo it: bumpVersions,
 * deleteManyQuietly and emitNotification all swallow their own failures. They
 * run AFTER rather than alongside, so nothing is invalidated, reclaimed or
 * announced for a delete that then rolled back.
 *
 * @param {string} userId
 * @returns {Promise<void>}
 * @throws {HttpError} 404 when the user does not exist, 502 when Stripe cannot
 *   cancel their subscription
 */
export const deleteAccount = async (userId) => {
  const { versionKeys, objectKeys, disbanded } = await readTeardown(userId);

  await cancelSubscriptionNow(userId);

  await prisma.$transaction(async (tx) => {
    await tx.comment.deleteMany({ where: { userId } });
    // Photos, likes, bookmarks, reports and group shares cascade with each post,
    // as do other people's comments on it.
    await tx.post.deleteMany({ where: { userId } });
    await tx.focusRating.deleteMany({ where: { userId } });
    // Interruptions, tasks and samples cascade; sessions that joined one of
    // these, and posts that pointed at one, are set to NULL.
    await tx.session.deleteMany({ where: { userId } });
    // Every member's membership and share cascades; sessions run in the group
    // keep their history with groupId set to NULL.
    await tx.studyGroup.deleteMany({ where: { ownerId: userId } });
    await tx.groupMembership.deleteMany({ where: { userId } });
    // Todos cascade; clones of these keep going with sourceRoutineId NULL.
    await tx.studyRoutine.deleteMany({ where: { userId } });
    await deleteUserRow(userId, tx);
  });

  await bumpVersions(versionKeys);
  await deleteManyQuietly(objectKeys, "account deleted");

  // No actorId: the owner's row is gone, and a notification pointing at it
  // would fail its foreign key. Awaited rather than fired and forgotten, so a
  // member whose app refetches on the 204's heels already has it.
  await Promise.all(
    disbanded.map(({ memberId, name }) =>
      emitNotification({
        userId: memberId,
        type: "GROUP_DISBANDED",
        message: disbandedMessage(name),
      }),
    ),
  );
};
