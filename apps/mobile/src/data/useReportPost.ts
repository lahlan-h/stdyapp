import { useCallback, useRef, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import * as postStore from "./postStore";
import type { ReportReason } from "./reportReasons";
import type { FeedPost } from "./types";

/**
 * What POST /api/reports answers: the bare Report row, not `{ data }`.
 *
 * Only `id` is read, and only so the report can be withdrawn later - withdrawal
 * is keyed by report id, unlike unliking, which is keyed by post. The rest of
 * the shape is written down because this file is the seam, and a component must
 * never learn it.
 */
interface ReportRow {
  id: string;
  reporterId: string;
  targetPostId: string | null;
  reason: string;
  status: string;
  details: string | null;
}

export interface ReportPostState {
  /** Resolves true when the report is filed, false when it was refused. */
  submitReport: (
    post: FeedPost,
    reason: ReportReason,
    details?: string,
  ) => Promise<boolean>;
  /** Resolves true when the report is withdrawn, false when it was refused. */
  withdrawReport: (post: FeedPost) => Promise<boolean>;
  isSubmitting: boolean;
  isWithdrawing: boolean;
  /** Set when a write failed, so the dialog can say so. */
  error?: string;
  reset: () => void;
}

/**
 * Files and withdraws reports on a post.
 *
 * PESSIMISTIC, where useLikePost is optimistic, and the difference is the UI
 * rather than the endpoint. A heart has to move under the finger or the tap
 * reads as dropped, so that hook writes the store first and rolls back on
 * failure. This one is driven by a dialog that shows a spinner and then a
 * confirmation screen: the spinner IS the acknowledgement, so the store is not
 * touched until the server has agreed, and there is nothing to roll back. Same
 * shape as useComments' addComment for the same reason.
 *
 * Filing is idempotent - 201 the first time and 200 for a repeat or a reopen -
 * so there is no "already reported" failure to handle. The in-flight guard below
 * is a UI guarantee, not a server one: two taps a frame apart would each open
 * their own request, and the second would resolve onto a dialog that had already
 * moved on.
 *
 * Note the asymmetry with liking. Unliking is keyed by POST
 * (DELETE /api/likes/post/:postId), so a card can undo from what it has already
 * rendered. Withdrawing is keyed by REPORT (PATCH /api/reports/:id), so the id
 * has to be carried on the post - which is why FeedPost has reportId at all.
 */
export const useReportPost = (): ReportPostState => {
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // A ref rather than state, for useLikePost's reason: the guard has to be
  // readable and writable within the SAME tick the press is handled, and a
  // state update is batched, so the second of two taps in one frame would
  // still see "nothing in flight".
  const inFlight = useRef(false);

  const submitReport = useCallback(
    async (post: FeedPost, reason: ReportReason, details?: string) => {
      if (inFlight.current) return false;

      const trimmed = details?.trim();
      inFlight.current = true;
      setError(undefined);
      setIsSubmitting(true);

      try {
        const filed = await withAuth((token) =>
          request<ReportRow>("/api/reports", {
            method: "POST",
            body: {
              targetPostId: post.id,
              reason,
              // Spread rather than a `details: trimmed` that could be undefined.
              // createReportSchema is a strictObject, and while an absent key is
              // fine, being explicit here keeps the body to exactly the fields
              // the API accepts.
              ...(trimmed ? { details: trimmed } : {}),
            },
            token,
          }),
        );

        // The id comes from the response rather than being assumed, because the
        // reopen path answers with the ORIGINAL row's id - the same report the
        // reporter withdrew earlier, put back into PENDING.
        postStore.setReported(post.id, true, filed.id);
        return true;
      } catch (err) {
        setError(describe(err));
        return false;
      } finally {
        inFlight.current = false;
        setIsSubmitting(false);
      }
    },
    [],
  );

  const withdrawReport = useCallback(async (post: FeedPost) => {
    if (inFlight.current) return false;

    // No id means no report to withdraw. Reachable only if a caller opens the
    // withdraw view for a post whose flag is filled but whose id never arrived,
    // which is a bug rather than a state to recover from - but it is better to
    // say so than to send PATCH /api/reports/undefined.
    if (!post.reportId) {
      setError("That report is no longer available.");
      return false;
    }

    inFlight.current = true;
    setError(undefined);
    setIsWithdrawing(true);

    try {
      await withAuth((token) =>
        request<ReportRow>(`/api/reports/${post.reportId}`, {
          method: "PATCH",
          // WITHDRAWN is one of only two statuses a reporter may set; the other
          // three are moderator verdicts and answer 403. See
          // REPORTER_ALLOWED_STATUSES in report.service.js.
          body: { status: "WITHDRAWN" },
          token,
        }),
      );

      // The row still exists - withdrawal is not a delete - but it is no longer
      // the viewer's live report, so the id goes with the flag. Filing again
      // reopens that same row and hands its id back.
      postStore.setReported(post.id, false, undefined);
      return true;
    } catch (err) {
      setError(describe(err));
      return false;
    } finally {
      inFlight.current = false;
      setIsWithdrawing(false);
    }
  }, []);

  return {
    submitReport,
    withdrawReport,
    isSubmitting,
    isWithdrawing,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/**
 * Says what the user can do about it, following useLikePost's describe().
 *
 * 400 and 403 fall through to the server's own sentence deliberately. This is
 * the one resource whose refusals are already written for a person to read -
 * "You cannot report your own post" is better copy than anything this layer
 * could substitute, and rewording it here would mean maintaining the same
 * sentence in two repositories.
 *
 * 429 gets its own wording because the write bucket is 20 per 60s rather than
 * the 60 likes share, so a user who hits it is much further from the limit
 * resetting than the heart's message would imply.
 */
const describe = (err: unknown): string => {
  if (!(err instanceof ApiError)) {
    return "Could not send that report. Try again.";
  }

  switch (err.status) {
    case 404:
      return "That post is no longer available.";
    case 429:
      return err.retryAfter
        ? `Too many reports. Try again in ${err.retryAfter}s.`
        : "Too many reports. Try again shortly.";
    default:
      return err.message;
  }
};
