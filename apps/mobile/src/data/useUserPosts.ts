import { useCallback, useEffect, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import { toFeedPost, type RawFeedRow } from "./feedMapping";
import * as postStore from "./postStore";
import type { FeedPost } from "./types";
import type { SetLiked } from "./usePosts";

export interface UserPostsState {
  posts: FeedPost[];
  isLoading: boolean;
  /** Set when the list could not be read. The screen shows it rather than an empty list. */
  error?: string;
  reload: () => void;
  /** Flips one post's heart and count - see SetLiked. */
  setLiked: SetLiked;
}

/**
 * One user's posts, newest first.
 *
 * NOT paginated, because the endpoint is not: GET /api/posts/user/:userId
 * returns the whole list. GET /api/posts/all is the only route in that router
 * that pages, and the only one answering a { data, pagination } envelope - this
 * one answers a bare array.
 *
 * Holds its OWN array rather than writing into postStore. That store is THE
 * feed - setPage replaces a page of it - so pouring a profile's posts in would
 * overwrite the feed the user scrolls back to.
 *
 * The cost of staying out of the store is that writes aimed at it do not reach
 * these rows. Likes are handled below. REPORTS ARE NOT: useReportPost writes
 * straight to postStore, which no-ops for a post the feed has not loaded, so a
 * report filed from a profile leaves this copy's flag unchanged. The screen
 * calls reload() when the dialog closes for exactly that reason - see
 * app/(tabs)/profile.tsx.
 *
 * @param userId - whose posts. Defaults to the caller's own; "me" is resolved
 *   by the API, which keys its cache on the resolved id rather than the literal.
 */
export const useUserPosts = (userId: string = "me"): UserPostsState => {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await withAuth((token) =>
        request<RawFeedRow[]>(`/api/posts/user/${userId}`, { token }),
      );
      setPosts(rows.map(toFeedPost));
      setError(undefined);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load these posts.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Applies the like here AND in the feed store.
   *
   * The store call is what stops the two disagreeing: the same post can be on
   * the feed and on this profile at once, and a heart filled here has to be
   * filled there too. It no-ops when the feed has not loaded that post, so it
   * is free in the common case.
   *
   * The count moves with the flag in both places - postStore.setLiked does it
   * there, and this does it here - because a filled heart above an unchanged
   * number is the bug that rule exists to prevent.
   */
  const setLiked = useCallback<SetLiked>((postId, isLiked) => {
    setPosts((current) => {
      const index = current.findIndex((post) => post.id === postId);
      if (index === -1 || current[index].isLiked === isLiked) return current;

      const post = current[index];
      const next = [...current];
      next[index] = {
        ...post,
        isLiked,
        likeCount: post.likeCount + (isLiked ? 1 : -1),
      };
      return next;
    });

    postStore.setLiked(postId, isLiked);
  }, []);

  return { posts, isLoading, error, reload: load, setLiked };
};
