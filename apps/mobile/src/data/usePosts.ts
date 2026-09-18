import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import { toFeedPost, type RawFeedRow } from "./feedMapping";
import * as postStore from "./postStore";
import type { FeedPost } from "./types";

/** How many posts to fetch per page. The API caps `limit` at 100. */
const PAGE_SIZE = 10;

interface FeedResponse {
  data: RawFeedRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}

/**
 * Applies one post's like state to every screen showing it.
 *
 * The optimistic half of a like lives in postStore rather than in useLikePost
 * because the store OWNS the posts - a second copy of them over there would be
 * two sources of truth for the same heart, and they would disagree the moment
 * a page is appended or the feed is refreshed underneath a tap.
 */
export type SetLiked = (postId: string, isLiked: boolean) => void;

export interface FeedState {
  posts: FeedPost[];
  /** True only for the first page, so the list shows a skeleton rather than an empty state. */
  isLoading: boolean;
  canLoadMore: boolean;
  loadMore: () => void;
  /** Set when the feed could not be read. The screen shows it rather than an empty feed. */
  error?: string;
  /** Re-reads from page one. Call after creating a post. */
  refresh: () => void;
  /** Flips one post's heart and count - see SetLiked. */
  setLiked: SetLiked;
}

/**
 * The home feed, newest first.
 *
 * Pages are appended rather than refetched, so scrolling does not re-request
 * what is already on screen. Each row arrives with its author and linked
 * session attached, which is why there is no per-card query.
 *
 * The posts themselves live in postStore, not here: the detail screen reads the
 * same array, so a like tapped there updates the card behind it without either
 * screen refetching, and without the feed losing its place.
 */
export const usePosts = (): FeedState => {
  const posts = useSyncExternalStore(postStore.subscribe, postStore.getSnapshot);

  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const fetchPage = useCallback(async (target: number) => {
    setIsFetching(true);
    try {
      const response = await withAuth((token) =>
        request<FeedResponse>(
          `/api/posts/all?page=${target}&limit=${PAGE_SIZE}`,
          { token },
        ),
      );

      // Page one replaces, later pages append - so refresh() needs no second
      // code path, and it drops rows deleted since the last read.
      postStore.setPage(response.data.map(toFeedPost), target);
      setHasNextPage(response.pagination.hasNextPage);
      setPage(target);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the feed.");
    } finally {
      setIsFetching(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  return {
    posts,
    isLoading,
    canLoadMore: hasNextPage && !isFetching,
    // Guarded rather than debounced: FlatList fires onEndReached repeatedly
    // while a fetch is in flight, and each one would append the same page.
    loadMore: useCallback(() => {
      if (!isFetching && hasNextPage) fetchPage(page + 1);
    }, [fetchPage, isFetching, hasNextPage, page]),
    error,
    refresh: useCallback(() => fetchPage(1), [fetchPage]),
    setLiked: postStore.setLiked,
  };
};
