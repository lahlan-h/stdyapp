import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import * as postStore from "./postStore";

/** What the API accepts, mirrored here so the composer can reject early. */
export const MAX_COMMENT_LENGTH = 2000;

/**
 * One comment as GET /api/comments/post/:postId returns it.
 *
 * Note what the author does NOT carry: the select is
 * { id, username, avatarUrl } only - no firstName or lastName, unlike the feed
 * row. So a comment can be attributed to a handle and nothing else.
 */
interface RawComment {
  id: string;
  userId: string;
  postId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; username: string; avatarUrl: string | null };
}

export interface Comment {
  id: string;
  body: string;
  /** Epoch milliseconds. */
  createdAt: number;
  /** True once the author has edited it - the API keeps both timestamps. */
  isEdited: boolean;
  author: {
    id: string;
    /**
     * A handle, not a display name. The comments endpoint has no first or last
     * name to build one from, so the UI shows @username - drawing a full name
     * here would be inventing one.
     */
    username: string;
    avatarUrl?: string;
  };
}

const toComment = (row: RawComment): Comment => ({
  id: row.id,
  body: row.body,
  createdAt: new Date(row.createdAt).getTime(),
  isEdited: row.updatedAt !== row.createdAt,
  author: {
    id: row.user.id,
    username: row.user.username,
    avatarUrl: row.user.avatarUrl ?? undefined,
  },
});

export interface CommentsState {
  comments: Comment[];
  isLoading: boolean;
  /** Set when the thread could not be read, or a submit failed. */
  error?: string;
  isSubmitting: boolean;
  /** Resolves true when the comment was created. */
  addComment: (body: string) => Promise<boolean>;
  refresh: () => void;
}

/**
 * A post's comment thread.
 *
 * Unpaginated by design on the API's side - GET /api/comments/post/:postId
 * answers a bare array, not a { data, pagination } envelope - so there is no
 * loadMore here and the whole thread is in memory. That is what makes sorting
 * newest-first a client-side reverse rather than a refetch.
 *
 * Ordered oldest-first, deliberately the reverse of the feed: a feed reads
 * backwards in time, a conversation reads forwards.
 */
export const useComments = (postId: string): CommentsState => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // A ref, not state: two taps in the same frame would both read a stale
  // `isSubmitting` before React committed the first update, and POST
  // /api/comments is NOT idempotent - each one creates a separate comment.
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    try {
      const rows = await withAuth((token) =>
        request<RawComment[]>(`/api/comments/post/${postId}`, { token }),
      );
      setComments(rows.map(toComment));
      setError(undefined);
    } catch (err) {
      setError(describe(err, "Could not load the comments."));
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  const addComment = useCallback(
    async (body: string): Promise<boolean> => {
      const trimmed = body.trim();
      if (!trimmed || inFlight.current) return false;

      inFlight.current = true;
      setIsSubmitting(true);
      setError(undefined);

      try {
        const created = await withAuth((token) =>
          request<RawComment>("/api/comments", {
            method: "POST",
            body: { postId, body: trimmed },
            token,
          }),
        );

        // Appended rather than refetched: the API answers with the created row,
        // author included, so a second round trip would only confirm what is
        // already in hand.
        const next = [...comments, toComment(created)];
        setComments(next);

        // The card behind this screen reads its count from the same store, so
        // this is what keeps the feed honest without refetching it - and
        // without it losing scroll position the way a full refresh would.
        postStore.setCommentCount(postId, next.length);
        return true;
      } catch (err) {
        setError(describe(err, "Could not post that comment. Try again."));
        return false;
      } finally {
        inFlight.current = false;
        setIsSubmitting(false);
      }
    },
    [comments, postId],
  );

  return {
    comments,
    isLoading,
    error,
    isSubmitting,
    addComment,
    refresh: load,
  };
};

/**
 * 404 is worth its own wording on this route: the endpoint answers it for an
 * unknown POST rather than returning an empty array, precisely so a client can
 * tell "no such post" from "nobody has commented yet".
 */
const describe = (err: unknown, fallback: string): string => {
  if (!(err instanceof ApiError)) return fallback;

  switch (err.status) {
    case 404:
      return "That post is no longer available.";
    case 429:
      return err.retryAfter
        ? `Too many comments. Try again in ${err.retryAfter}s.`
        : "Too many comments. Try again shortly.";
    default:
      return err.message;
  }
};
