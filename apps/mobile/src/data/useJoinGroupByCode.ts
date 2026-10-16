import { useCallback, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import { markGroupChanged } from "./groupSignal";
import { describeGroupError, toGroup, type RawGroup, type StudyGroup } from "./groupTypes";

/** How a code turned out - each one is somewhere for the screen to go. */
export type JoinByCodeResult =
  /** In, as of now. */
  | { kind: "joined"; group: StudyGroup }
  /** Already a member: not an error, just the group to open. */
  | { kind: "already"; groupId: string }
  /** No such code, or the request failed - `error` says which. */
  | { kind: "failed" };

export interface JoinGroupByCodeState {
  joinByCode: (code: string) => Promise<JoinByCodeResult>;
  isJoining: boolean;
  /** Why the last attempt failed, in words for the screen. Cleared on the next. */
  error?: string;
  clearError: () => void;
}

/**
 * Joins whichever group a code belongs to - the Study tab's "Join a group".
 *
 * POST /api/groups/join takes the code alone, public group or private: the
 * code is the key. A group you are already in answers 409 with its id, which
 * this turns into somewhere to go rather than an error, since typing your own
 * group's code just means you wanted to see it.
 */
export const useJoinGroupByCode = (): JoinGroupByCodeState => {
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const joinByCode = useCallback(async (code: string): Promise<JoinByCodeResult> => {
    setIsJoining(true);
    setError(undefined);
    try {
      const raw = await withAuth((token) =>
        request<RawGroup>("/api/groups/join", { method: "POST", token, body: { code } }),
      );
      const group = toGroup(raw);
      // The Groups view's lists catch up on focus - see groupSignal.ts.
      markGroupChanged(group.id);
      return { kind: "joined", group };
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && typeof err.data.groupId === "string") {
        return { kind: "already", groupId: err.data.groupId };
      }
      setError(describeJoinError(err));
      return { kind: "failed" };
    } finally {
      setIsJoining(false);
    }
  }, []);

  const clearError = useCallback(() => setError(undefined), []);

  return { joinByCode, isJoining, error, clearError };
};

/** A 404 here is a mistyped code, not a missing group - say it that way. */
const describeJoinError = (err: unknown): string =>
  err instanceof ApiError && err.status === 404
    ? "No group has that code. Check it and try again."
    : describeGroupError(err, "Could not join that group.");
