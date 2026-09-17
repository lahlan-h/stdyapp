/**
 * The mobile app's data access layer, and the ONLY place that knows which
 * backend is answering.
 *
 * Components import hooks and types from here and never call the API directly.
 * Everything below talks to the Express + Prisma API in apps/api; the Convex
 * stub this used to read from has been deleted. Keep the seam: a `fetch` to the
 * API anywhere outside src/data is a bug, and so is a component that knows what
 * `_count` or `photoUrl` means.
 */
export type { FeedAuthor, FeedPost, FeedSession } from "./types";
export { usePosts, type FeedState } from "./usePosts";
export { consumeFeedStale } from "./feedSignal";
export {
  useCreatePost,
  MAX_PHOTO_BYTES,
  MAX_CAPTION_LENGTH,
  MAX_TITLE_LENGTH,
  type NewPost,
  type NewPostPhoto,
  type CreatedPost,
  type CreatePostState,
} from "./useCreatePost";
export {
  useNotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  type NotificationPreferencesState,
} from "./useNotificationPreferences";
