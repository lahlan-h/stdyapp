import { useCallback, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import type { FeedPost } from "./types";
import type { SetLiked } from "./usePosts";

/**
 * What POST /api/likes answers: the bare Like row, not `{ data }` and not the
 * post. Nothing here reads it - the heart was already drawn from local state
 * before the request went out - but the shape is written down because this file
 * is the seam, and a component must never learn it.
 */
interface LikeRow {
  id: string;
  userId: string;
  postId: string;
}

export interface LikePostState {
  /**
   * Flips the heart on one post.
   *
   * Takes the whole post rather than an id and a flag, and that is not
   * ceremony: the flag would read identically to setLiked's while meaning the
   * opposite - the state to move AWAY from, rather than the state to apply -
   * and that is a signature a caller gets backwards exactly once, silently.
   */
  toggleLike: (post: FeedPost) => void;
  /** Set when a toggle failed and was rolled back, so the screen can say so. */
  error?: string;
  reset: () => void;
}

/**
 * Likes and unlikes a post, with the feed updated before the request is sent.
 *
 * Both endpoints are idempotent by design - POST /api/likes answers 201 the
 * first time and 200 for a repeat, DELETE /api/likes/post/:postId answers 204
 * whether or not a like was ever there - so nothing here dedupes on the
 * server's behalf. The in-flight guard is a UI guarantee instead: two taps a
 * frame apart would each apply their own optimistic +1/-1 to the same post and
 * leave the count off by one against a server that only ever saw one state
 * change.
 *
 * Note the unlike path is keyed by POST id, not like id. There is no
 * /api/likes/:id route at all, which is exactly what lets a card unlike from
 * what it has already rendered instead of first fetching the like row.
 *
 * Both directions share ONE rate-limit bucket of 60 per 60s, so a toggled heart
 * spends that budget twice as fast as a liked one - another reason not to let a
 * double-tap through.
 */
export const useLikePost = (setLiked: SetLiked): LikePostState => {
  const [error, setError] = useState<string | undefined>(undefined);

  // A ref rather than state, because the guard has to be readable and writable
  // within the SAME tick the press is handled. A state update is batched, so
  // the second of two taps in one frame would still see "nothing in flight" -
  // precisely the case this exists for. It also has nothing to say to the
  // renderer: re-rendering the feed to track it would cost a pass for no
  // visible change.
  const inFlight = useRef<Set<string>>(new Set());

  const toggleLike = useCallback(
    (post: FeedPost) => {
      const { id, isLiked } = post;
      if (inFlight.current.has(id)) return;

      const next = !isLiked;
      inFlight.current.add(id);
      setError(undefined);

      // BEFORE the request rather than after it. A heart that waits on a round
      // trip reads as a tap the app dropped, which is what makes people tap
      // again.
      setLiked(id, next);

      // Deliberately not awaited - the caller is an onPress, and the UI is
      // already up to date. Everything below is inside try/finally, so nothing
      // can escape as an unhandled rejection.
      void (async () => {
        try {
          // A statement body rather than a ternary, because the two calls do
          // not share a response type - the like answers a row, the unlike
          // answers 204 - and a conditional expression would make withAuth
          // infer one Promise type for both.
          await withAuth(async (token) => {
            if (next) {
              await request<LikeRow>("/api/likes", {
                method: "POST",
                body: { postId: id },
                token,
              });
              return;
            }

            await request<void>(`/api/likes/post/${id}`, {
              method: "DELETE",
              token,
            });
          });
        } catch (err) {
          // Both halves go back together, which one setLiked call guarantees:
          // a count left standing above a grey heart is worse than a tap that
          // visibly did nothing, because nothing on screen says it is wrong.
          setLiked(id, isLiked);
          setError(describe(err));
        } finally {
          inFlight.current.delete(id);
        }
      })();
    },
    [setLiked],
  );

  return {
    toggleLike,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/**
 * Says what the user can do about it, following useCreatePost's describe().
 *
 * 404 is worth its own wording: the post was deleted between the feed being
 * read and the heart being tapped, and "Post not found" invites the user to
 * retry something that can only fail again.
 */
const describe = (err: unknown): string => {
  if (!(err instanceof ApiError)) return "Could not save that like. Try again.";

  switch (err.status) {
    case 404:
      return "That post is no longer available.";
    case 429:
      return err.retryAfter
        ? `Too many likes. Try again in ${err.retryAfter}s.`
        : "Too many likes. Try again shortly.";
    default:
      return err.message;
  }
};
