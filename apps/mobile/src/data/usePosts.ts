import { useCallback } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@stdyapp/convex-stub";

import type { FeedPost } from "./types";

/** How many posts to fetch per page. */
const PAGE_SIZE = 10;

/**
 * One row as the backend returns it, before mapping onto the UI's own shape.
 *
 * This is the boundary: Convex's `_id` / `_creationTime` naming stops here and
 * never reaches a component. Declared structurally rather than imported from the
 * generated Convex types so replacing the backend does not ripple outward.
 */
interface RawFeedRow {
  _id: string;
  authorId: string;
  _creationTime: number;
  title: string;
  caption?: string;
  durationMinutes: number;
  goalsHit: number;
  imageUrl?: string;
  likeCount: number;
  author: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  } | null;
}

/**
 * Returns null when the author is missing - the query joins the author but
 * leaves it nullable, because dropping rows inside a paginated query returns
 * short pages and confuses the cursor. Filtering belongs here instead. See
 * getPosts in packages/convex-stub/convex/posts.ts.
 */
const toFeedPost = (row: RawFeedRow): FeedPost | null => {
  if (!row.author) {
    // Loud in development, because this failure is otherwise invisible: a post
    // dropped here just does not appear, so a feed where every author dangled
    // would render empty with no error - indistinguishable from a backend that
    // is not answering at all.
    if (__DEV__) {
      console.warn(`[usePosts] dropping post ${row._id}: author ${row.authorId} did not resolve`);
    }
    return null;
  }

  return {
    id: row._id,
    title: row.title,
    caption: row.caption,
    durationMinutes: row.durationMinutes,
    goalsHit: row.goalsHit,
    imageUrl: row.imageUrl,
    likeCount: row.likeCount,
    createdAt: row._creationTime,
    author: {
      id: row.author._id,
      username: row.author.username,
      displayName: row.author.displayName,
      avatarUrl: row.author.avatarUrl,
    },
  };
};

export interface FeedState {
  posts: FeedPost[];
  /** True only for the first page, so the list shows a skeleton rather than an empty state. */
  isLoading: boolean;
  canLoadMore: boolean;
  loadMore: () => void;
}

/**
 * The home feed, newest first.
 *
 * One subscription per page, with each post's author already attached. The feed
 * used to fetch every post in the table on load and then fire a query per card
 * for its author and another for its likes.
 */
export const usePosts = (): FeedState => {
  const { results, status, loadMore } = usePaginatedQuery(
    api.posts.getPosts,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  return {
    posts: (results as RawFeedRow[])
      .map(toFeedPost)
      .filter((post): post is FeedPost => post !== null),
    isLoading: status === "LoadingFirstPage",
    canLoadMore: status === "CanLoadMore",
    loadMore: useCallback(() => loadMore(PAGE_SIZE), [loadMore]),
  };
};
