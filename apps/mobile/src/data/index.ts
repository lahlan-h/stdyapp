/**
 * The mobile app's data access layer, and the ONLY place that knows which
 * backend is answering.
 *
 * Components import hooks and types from here and never import
 * @stdyapp/convex-stub directly. That stub is temporary - the real backend is
 * the Express + Prisma API in apps/api - and this seam is what keeps the
 * migration to it a change to this directory rather than a rewrite of every
 * screen and card. Keep it that way: an `import ... from "@stdyapp/convex-stub"`
 * anywhere outside src/data is a bug.
 */
export type { FeedAuthor, FeedPost } from "./types";
export { usePosts, type FeedState } from "./usePosts";
