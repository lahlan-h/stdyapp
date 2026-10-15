import { toDisplayName } from "./feedMapping";
import type { FeedAuthor } from "./types";

/**
 * One person, named and pictured - a search result, a recent search, the
 * actor on a notification, the other side of a chat.
 *
 * The same shape a post card's author already has, on purpose: one type means
 * a result row, a chat header and a card header can never disagree about how
 * someone is shown.
 *
 * Its own module, with no API or auth imports, so the stores that map people
 * (messages, notifications) can import it without closing an import cycle
 * through auth.ts - which resets those same stores on sign-out.
 */
export type UserSummary = FeedAuthor;

/**
 * One user as the API lists them - USER_SEARCH_SELECT, and the summary select
 * notifications and conversations use: names and face, never email.
 */
export interface RawUser {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export const toUserSummary = (user: RawUser): UserSummary => ({
  id: user.id,
  username: user.username,
  displayName: toDisplayName(user.firstName, user.lastName, user.username),
  avatarUrl: user.avatarUrl ?? undefined,
});
