/**
 * The shapes the UI renders.
 *
 * Deliberately NOT the API's row shape. These are the app's own domain types,
 * so a change to the backend underneath this directory changes the mapping
 * functions and nothing in the component tree. Anything backend-specific -
 * `_count`, `photoUrl`, ISO date strings - stops here and must not appear in a
 * component.
 */

import type { ReportReason } from "./reportReasons";

export interface FeedAuthor {
  id: string;
  username: string;
  /** firstName + lastName where the account has them, else the username. */
  displayName: string;
  avatarUrl?: string;
}

/**
 * The study session a post was made about, when it was made about one.
 *
 * Absent on most posts: linking is optional, and the compose screen does not
 * offer a picker yet. The card renders its stats only when this resolves,
 * rather than showing zeroes for a session that does not exist.
 */
export interface FeedSession {
  /**
   * Null while the session is still running.
   *
   * Not zero - the API takes the same position, excluding unfinished sessions
   * from goal totals rather than counting them as nothing.
   */
  durationMinutes: number | null;
  /** Minutes studied, less 10 for each interruption over 20 minutes. */
  focusPoints: number;
}

export interface FeedPost {
  id: string;
  /** The headline, and the only text a post must have. */
  title: string;
  /** Optional supporting text below the title. */
  caption?: string;
  imageUrl?: string;
  likeCount: number;
  /**
   * Whether the CURRENT viewer has liked it - what decides the heart's colour.
   *
   * Separate from likeCount because the two answer different questions and only
   * one of them is per-viewer: the count is a total over everyone, so a heart
   * drawn from it alone could never know whether to be filled.
   */
  isLiked: boolean;
  /**
   * Whether the CURRENT viewer has reported it - what fills the flag in.
   *
   * Per-viewer for isLiked's reason, and travelling ALONE for one that is not
   * symmetrical with it: there is no reportCount beside this, there is no route
   * that could supply one, and the Report model in the schema says such a count
   * must never be added. A count would tell a post's author they had been
   * reported, and it would say so again every time it moved. So the flag's fill
   * is the whole of what this feature shows, and it only ever shows it to the
   * person who filed it.
   */
  isReported: boolean;
  /**
   * The viewer's own report row, carried so it can be withdrawn.
   *
   * Withdrawing is keyed by REPORT id, not post id - there is no
   * /api/reports/post/:postId route the way unliking has
   * /api/likes/post/:postId - so a card with nothing but the post in hand could
   * not undo what it just did. Undefined whenever isReported is false, including
   * for a report that was withdrawn: that row still exists, but its id is not
   * something to withdraw a second time.
   */
  reportId?: string;
  /**
   * Which of REPORT_REASONS the viewer filed, so the dialog can read it back.
   *
   * Their own words returned to them, which is the one direction this table
   * opens - there is no way to learn what anybody ELSE reported, and there is
   * not going to be one. Undefined whenever isReported is false, and also when
   * the stored reason is one this build has no label for.
   */
  reportReason?: ReportReason;
  /**
   * Whether the VIEWER wrote this post.
   *
   * Here to WITHHOLD an action rather than to grant one. The API refuses a
   * self-report on its own authority - fileReport answers 400 "You cannot
   * report your own post" - and this only stops the app offering a flag that
   * could never succeed. Trusting it for anything that matters would be
   * trusting a client to decide what a client may do.
   *
   * Sent by the API rather than compared against `author.id` here, because the
   * app does not know who the viewer is: auth.ts keeps the access token and
   * throws away the user the dev-token response arrives with.
   */
  isMine: boolean;
  commentCount: number;
  /** Epoch milliseconds. */
  createdAt: number;
  author: FeedAuthor;
  session?: FeedSession;
}
