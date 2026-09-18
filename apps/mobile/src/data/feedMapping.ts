import type { FeedPost, FeedSession } from "./types";

/**
 * One row as GET /api/posts/all returns it.
 *
 * Declared structurally rather than generated from Prisma so replacing the
 * backend does not ripple outward. `_count` and `photoUrl` stop here.
 */
export interface RawFeedRow {
  id: string;
  title: string;
  caption: string | null;
  photoUrl: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  session: {
    startedAt: string;
    endedAt: string | null;
    focusPoints: number;
  } | null;
  _count: { likes: number; comments: number };
  /**
   * The viewer's own like, already flattened to a boolean by the API - see
   * listAllPosts, which maps the filtered `likes` relation away rather than
   * putting a join shape on the wire.
   */
  isLiked: boolean;
}

/**
 * Floored at zero the way the API does it, because a clock adjustment can put
 * endedAt before startedAt and a negative duration renders as nonsense.
 */
const toSession = (row: RawFeedRow): FeedSession | undefined => {
  if (!row.session) return undefined;

  const { startedAt, endedAt, focusPoints } = row.session;

  return {
    durationMinutes: endedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(endedAt).getTime() - new Date(startedAt).getTime()) /
              60000,
          ),
        )
      : null,
    focusPoints,
  };
};

/**
 * Lives here rather than inside usePosts because more than one screen needs it
 * now. Duplicating it would duplicate the rules this layer exists to contain -
 * that `_count` becomes a flat count, that a null photoUrl becomes undefined
 * rather than null, and how a display name is built.
 */
export const toFeedPost = (row: RawFeedRow): FeedPost => {
  const { firstName, lastName, username } = row.user;
  const name = [firstName, lastName].filter(Boolean).join(" ");

  return {
    id: row.id,
    title: row.title,
    caption: row.caption ?? undefined,
    imageUrl: row.photoUrl ?? undefined,
    likeCount: row._count.likes,
    isLiked: row.isLiked,
    commentCount: row._count.comments,
    createdAt: new Date(row.createdAt).getTime(),
    author: {
      id: row.user.id,
      username,
      // Both names are nullable in the database even though signup demands
      // them, so an older row can have neither. The username always exists.
      displayName: name || username,
      avatarUrl: row.user.avatarUrl ?? undefined,
    },
    session: toSession(row),
  };
};
