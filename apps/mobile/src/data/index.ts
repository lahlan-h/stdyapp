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
export { useIsSignedIn, useSessionRestored, logout } from "./auth";
export { useLogin, type LoginState } from "./useLogin";
export { useRegister, type RegisterState } from "./useRegister";
export { useGoogleSignIn, type GoogleSignInState } from "./useGoogleSignIn";
export type { RegisterInput } from "./auth";
export {
  REGISTRATION_CHECK_GROUPS,
  REGISTRATION_CHECK_COUNT,
  MAX_USERNAME_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  evaluateRegistration,
  countPassed,
  isValidUsername,
  withinPasswordLimit,
  type RegistrationCheckKey,
  type RegistrationResults,
} from "./registrationChecks";
export { usePosts, type FeedState, type SetLiked } from "./usePosts";
export { usePost } from "./usePost";
// The store's own setter, for a screen that shows ONE post and so has no feed
// hook to take it from. Same function usePosts hands back - there is one array.
export { setLiked as setPostLiked } from "./postStore";
export { useLikePost, type LikePostState } from "./useLikePost";
export { useReportPost, type ReportPostState } from "./useReportPost";
export {
  REPORT_REASONS,
  DETAILED_REASON,
  MAX_REPORT_DETAILS,
  type ReportReason,
} from "./reportReasons";
export {
  useComments,
  MAX_COMMENT_LENGTH,
  type Comment,
  type CommentsState,
} from "./useComments";
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
