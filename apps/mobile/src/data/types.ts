/**
 * The shapes the UI renders.
 *
 * Deliberately NOT the API's row shape. These are the app's own domain types,
 * so a change to the backend underneath this directory changes the mapping
 * functions and nothing in the component tree. Anything backend-specific -
 * `_count`, `photoUrl`, ISO date strings - stops here and must not appear in a
 * component.
 */

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
  commentCount: number;
  /** Epoch milliseconds. */
  createdAt: number;
  author: FeedAuthor;
  session?: FeedSession;
}
