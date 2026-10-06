import { toUserSummary, type RawUser, type UserSummary } from "./useUserSearch";

/**
 * The kinds of notification the API raises - NotificationType in schema.prisma.
 *
 * Listed here so a screen can choose an icon per kind without knowing the
 * API's enum exists; see toNotification for what happens to a kind this build
 * has never heard of.
 */
export const NOTIFICATION_TYPES = [
  "FOLLOW",
  "POST_LIKE",
  "POST_COMMENT",
  "GROUP_JOIN",
  "STREAK_MILESTONE",
  "GOAL_REACHED",
  "SYSTEM",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** One notification as a screen sees it. */
export interface AppNotification {
  id: string;
  type: NotificationType;
  /** Ready to show: the API stores each message pre-written. */
  message: string;
  isRead: boolean;
  /** Epoch ms, like FeedPost.createdAt. */
  createdAt: number;
  /**
   * Who caused it, when a person did - the follower, the liker. Absent for a
   * streak or a goal, and for anything raised before the API recorded actors.
   * Named the way user search names people, which is also how the API wrote
   * the message, so the name can be found in the text and linked.
   */
  actor?: UserSummary;
}

/** One row as GET /api/notifications and the socket's `created` event carry it. */
export interface RawNotification {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actor?: RawUser | null;
}

/**
 * Narrows the type the same way feedMapping narrows a report reason: an enum
 * value added on the API after this build shipped becomes SYSTEM - a generic
 * icon - rather than a row with no icon at all.
 */
export const toNotification = (row: RawNotification): AppNotification => ({
  id: row.id,
  type: NOTIFICATION_TYPES.find((type) => type === row.type) ?? "SYSTEM",
  message: row.message,
  isRead: row.isRead,
  createdAt: new Date(row.createdAt).getTime(),
  actor: row.actor ? toUserSummary(row.actor) : undefined,
});
