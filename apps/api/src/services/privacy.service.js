import { prisma } from "@stdyapp/core";

import { findProfileVisibility } from "./user.service.js";
import { visibleTo } from "../repositories/post.repository.js";

/**
 * Private accounts: who may see whose activity.
 *
 * THE RULE, in one place. A viewer may see a user's posts, streak, follower
 * lists, likes, comments and routines when any of these holds:
 *   - the viewer IS the user;
 *   - the user is not private;
 *   - the viewer is an APPROVED follower - a Follow row, never a pending
 *     FollowRequest.
 *
 * What it does NOT cover, on purpose:
 *   - The profile header. GET /api/users/:id and the follow counts stay open,
 *     so a stranger knows whose door they are knocking on.
 *   - A study group's own surfaces. Its feed, leaderboard, live strip and member
 *     list show every member to every other member: joining a group, and sharing
 *     a post to it, is choosing to be seen there.
 *
 * The same rule as a Prisma `where` is authorVisibleTo, in post.repository.js,
 * for queries that filter many users at once. The two must agree.
 */

/**
 * Whether `viewerId` may see `targetId`'s activity.
 *
 * TRUE for an unknown user, deliberately: this is a privacy check, not an
 * existence check, and every caller already answers an unknown id with its own
 * 404. Refusing here first would turn "no such user" into "private account" -
 * a different answer for the same question.
 *
 * @param {string} viewerId
 * @param {string} targetId
 * @returns {Promise<boolean>}
 */
export const canViewUser = async (viewerId, targetId) => {
  if (viewerId === targetId) return true;

  const visibility = await findProfileVisibility(targetId, viewerId);
  if (!visibility) return true;

  return !visibility.isPrivate || visibility.followedByViewer;
};

/**
 * Whether `viewerId` may see this post: their own, shared to followers by an
 * author they may see, or shared to a group they are in - visibleTo, the rule
 * every post list already takes, asked of one post.
 *
 * FALSE for an unknown post, unlike canViewUser, because every caller answers
 * both the same way - "Post not found" - so a hidden post and a missing one are
 * indistinguishable from outside.
 *
 * @param {string} viewerId
 * @param {string} postId
 * @returns {Promise<boolean>}
 */
export const canViewPost = async (viewerId, postId) => {
  const count = await prisma.post.count({
    where: { AND: [{ id: postId }, visibleTo(viewerId)] },
  });
  return count > 0;
};
