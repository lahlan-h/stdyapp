import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import { toFeedPost, type RawFeedRow } from "./feedMapping";
import { toFeedQuery, type FeedFilters } from "./feedFilters";
import * as postStore from "./postStore";
import type { FeedPost } from "./types";

/** How many posts to fetch per page. The API caps `limit` at 100. */
const PAGE_SIZE = 10;

/** The unfiltered feed's query, for a caller that passes no filters at all. */
const DEFAULT_QUERY = "sort=recent";

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
  /**
   * True while page one is being re-read for a CHANGED filter or a refresh, with
   * the previous posts still on screen. The screen dims them rather than
   * swapping in a spinner, so a chip tap does not blank the feed.
   */
  isRefreshing: boolean;
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
 * The home feed - newest first, unless `filters` asks for another order or a
 * window of days.
 *
 * Pages are appended rather than refetched, so scrolling does not re-request
 * what is already on screen. Each row arrives with its author and linked
 * session attached, which is why there is no per-card query.
 *
 * The posts themselves live in postStore, not here: the detail screen reads the
 * same array, so a like tapped there updates the card behind it without either
 * screen refetching, and without the feed losing its place. A FILTERED feed
 * writes there too - the store holds whichever feed is on screen, which is the
 * one the detail screen is opened from.
 *
 * Changing the filter re-reads from page one. The filter is compared as its
 * query string, so a new object with the same contents does not refetch.
 */
export const usePosts = (filters?: FeedFilters): FeedState => {
  const posts = useSyncExternalStore(postStore.subscribe, postStore.getSnapshot);
  const query = filters ? toFeedQuery(filters) : DEFAULT_QUERY;

  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /**
   * Which read of page one the latest response must belong to.
   *
   * Filters change faster than the network answers: tap "Most likes" then
   * "Most comments" and both requests are in flight at once. Without this the
   * slower one wins whichever it is, and the feed shows likes under a filter
   * that says comments. A later page carries the ticket of the page one it
   * follows, so a page 2 of the OLD filter is dropped as well.
   */
  const generation = useRef(0);

  const fetchPage = useCallback(
    async (target: number) => {
      const ticket = target === 1 ? ++generation.current : generation.current;
      setIsFetching(true);
      if (target === 1) setIsRefreshing(true);

      try {
        const response = await withAuth((token) =>
          request<FeedResponse>(
            `/api/posts/all?page=${target}&limit=${PAGE_SIZE}&${query}`,
            { token },
          ),
        );
        if (ticket !== generation.current) return;

        // Page one replaces, later pages append - so refresh() needs no second
        // code path, and it drops rows deleted since the last read.
        postStore.setPage(response.data.map(toFeedPost), target);
        setHasNextPage(response.pagination.hasNextPage);
        setPage(target);
        setError(undefined);
      } catch (err) {
        if (ticket !== generation.current) return;
        setError(err instanceof Error ? err.message : "Could not load the feed.");
      } finally {
        // Only the current generation may clear the flags: a superseded request
        // finishing would otherwise mark the feed idle while its replacement is
        // still on the way.
        if (ticket === generation.current) {
          setIsFetching(false);
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [query],
  );

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  return {
    posts,
    isLoading,
    isRefreshing,
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
