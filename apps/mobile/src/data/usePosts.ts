import { useCallback, useEffect, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import type { FeedPost, FeedSession } from "./types";

/** How many posts to fetch per page. The API caps `limit` at 100. */
const PAGE_SIZE = 10;

/**
 * One row as GET /api/posts/all returns it.
 *
 * Declared structurally rather than generated from Prisma so replacing the
 * backend does not ripple outward. `_count` and `photoUrl` stop here.
 */
interface RawFeedRow {
  id: string;
  title: string;
  caption: string | null;
  photoUrl: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  session: {
    startedAt: string;
    endedAt: string | null;
    focusPoints: number;
  } | null;
  _count: { likes: number; comments: number };
}

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
 * Floored at zero the way the API does it, because a clock adjustment can put
 * endedAt before startedAt and a negative duration renders as nonsense.
 */
const toSession = (row: RawFeedRow): FeedSession | undefined => {
  if (!row.session) return undefined;

  const { startedAt, endedAt, focusPoints } = row.session;

  return {
    durationMinutes: endedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(endedAt).getTime() - new Date(startedAt).getTime()) /
              60000,
          ),
        )
      : null,
    focusPoints,
  };
};

const toFeedPost = (row: RawFeedRow): FeedPost => {
  const { firstName, lastName, username } = row.user;
  const name = [firstName, lastName].filter(Boolean).join(" ");

  return {
    id: row.id,
    title: row.title,
    caption: row.caption ?? undefined,
    imageUrl: row.photoUrl ?? undefined,
    likeCount: row._count.likes,
    commentCount: row._count.comments,
    createdAt: new Date(row.createdAt).getTime(),
    author: {
      id: row.user.id,
      username,
      // Both names are nullable in the database even though signup demands
      // them, so an older row can have neither. The username always exists.
      displayName: name || username,
      avatarUrl: row.user.avatarUrl ?? undefined,
    },
    session: toSession(row),
  };
};

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
}

/**
 * The home feed, newest first.
 *
 * Pages are appended rather than refetched, so scrolling does not re-request
 * what is already on screen. Each row arrives with its author and linked
 * session attached, which is why there is no per-card query.
 */
export const usePosts = (): FeedState => {
  const [posts, setPosts] = useState<FeedPost[]>([]);
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

      const mapped = response.data.map(toFeedPost);
      // Replacing on page one is what makes refresh() work without a second
      // code path, and it drops rows deleted since the last read.
      setPosts((current) => (target === 1 ? mapped : [...current, ...mapped]));
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
  };
};
