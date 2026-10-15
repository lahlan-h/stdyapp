import { REPORT_REASONS, type ReportReason } from "./reportReasons";
import type { FeedAuthor, FeedPost, FeedSession, PostHighlight } from "./types";

/**
 * One row as GET /api/posts/all returns it.
 *
 * Declared structurally rather than generated from Prisma so replacing the
 * backend does not ripple outward. `_count` and `photoUrl` stop here.
 */
/** A person as the API's public user allowlist sends them. */
interface RawUser {
  id: string;
  username: string;
  avatarUrl: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface RawFeedRow {
  id: string;
  title: string;
  caption: string | null;
  photoUrl: string | null;
  createdAt: string;
  user: RawUser;
  session: {
    startedAt: string;
    endedAt: string | null;
    focusPoints: number;
    /** Null when the session had no task list. */
    tasksTotal?: number | null;
    tasksCompleted?: number | null;
    /** Absent from an API that predates group-room tagging. */
    studiedWith?: RawUser[];
    focusScore?: number | null;
    plannedMinutes?: number | null;
    /** Keys from services/postSession.js's HIGHLIGHTS. */
    highlights?: string[];
  } | null;
  /** Null when no routine is linked, or the linked one was deleted. */
  routine: { id: string; title: string } | null;
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

  const {
    startedAt,
    endedAt,
    focusPoints,
    tasksTotal,
    tasksCompleted,
    studiedWith,
    focusScore,
    plannedMinutes,
    highlights,
  } = row.session;

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
    tasks: tasksTotal ? { done: tasksCompleted ?? 0, total: tasksTotal } : undefined,
    studiedWith: (studiedWith ?? []).map(toAuthor),
    focusScore: focusScore ?? null,
    highlights: (highlights ?? []).flatMap((key) => toHighlight(key, plannedMinutes)),
  };
};

/**
 * One badge key from the API, as the app names it - or nothing for a key this
 * build does not know, so the API can ship a new badge before the app does.
 */
const toHighlight = (key: string, plannedMinutes?: number | null): PostHighlight[] => {
  switch (key) {
    case "PERSONAL_BEST":
      return [{ kind: "personalBest" }];
    case "HIT_PLAN":
      return plannedMinutes ? [{ kind: "hitPlan", plannedMinutes }] : [];
    case "PHONE_FREE":
      return [{ kind: "phoneFree" }];
    default:
      return [];
  }
};

/**
 * How a person is named on screen: first and last name, or the username when
 * they have neither.
 *
 * Both names are nullable in the database even though signup demands them, so
 * an older row can have neither. The username always exists. Shared by the feed
 * and by user search, so a person reads the same in a result row as on the post
 * card that row's profile leads to.
 */
export const toDisplayName = (
  firstName: string | null,
  lastName: string | null,
  username: string,
): string => [firstName, lastName].filter(Boolean).join(" ") || username;

/** A person as the UI names and pictures them - the author, or a study buddy. */
const toAuthor = (user: RawUser): FeedAuthor => ({
  id: user.id,
  username: user.username,
  displayName: toDisplayName(user.firstName, user.lastName, user.username),
  avatarUrl: user.avatarUrl ?? undefined,
});

/**
 * Lives here rather than inside usePosts because more than one screen needs it
 * now. Duplicating it would duplicate the rules this layer exists to contain -
 * that `_count` becomes a flat count, that a null photoUrl becomes undefined
 * rather than null, and how a display name is built.
 */
export const toFeedPost = (row: RawFeedRow): FeedPost => {
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
    author: toAuthor(row.user),
    session: toSession(row),
    // `?? undefined` for the same reason as caption: an API that predates the
    // routine join sends no key at all, and the card must not crash on it.
    routine: row.routine ?? undefined,
  };
};
