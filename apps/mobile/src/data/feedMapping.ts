import { REPORT_REASONS, type ReportReason } from "./reportReasons";
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
  /**
   * The viewer's own report, flattened by the API the same way `isLiked` is -
   * see listAllPosts, which reads Post.reports filtered to the caller and maps
   * the relation away rather than putting a join shape on the wire.
   *
   * Note there is no report COUNT beside it, and there is not going to be one.
   */
  isReported: boolean;
  /** The report's own id while it is live, null once it is not. */
  reportId: string | null;
  /** One of REPORT_REASONS while it is live, null once it is not. */
  reportReason: string | null;
  /**
   * Whether the viewer wrote this post, worked out by the API.
   *
   * Sent rather than derived from `user.id` because this app has no idea who
   * the viewer is - auth.ts keeps the access token and discards the user the
   * dev-token response hands it.
   */
  isMine: boolean;
}

/**
 * Narrows the report's reason to the set this app has labels for.
 *
 * An unknown string becomes undefined rather than being passed through. The
 * column is a plain TEXT whose vocabulary is closed at the API's edge precisely
 * so it can grow without a migration - which means a build of this app can
 * outlive its own copy of the list, and the failure would otherwise be a
 * confirmation screen reading "Filed as .".
 */
const toReportReason = (value: string | null): ReportReason | undefined => {
  if (!value) return undefined;
  return REPORT_REASONS.find((reason) => reason === value);
};

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
    isReported: row.isReported,
    reportId: row.reportId ?? undefined,
    // Narrowed on the way in rather than trusted: the column is a plain TEXT
    // whose set is closed at the API's edge, so a row written before a reason
    // was renamed would arrive as a string this app has no label for.
    reportReason: toReportReason(row.reportReason),
    isMine: row.isMine,
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
