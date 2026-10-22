import { useCallback, useEffect, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import { describeRoutineError, type RoutineDetail } from "./routineTypes";

/**
 * GET /api/routines/:id/preview - someone's routine as anyone may see it.
 *
 * Read-only by design: the tasks' titles and due dates, never whether they are
 * ticked. Someone's progress is theirs; what is shared is the plan.
 */
export interface RoutinePreview {
  id: string;
  title: string;
  createdAt: string;
  owner: { id: string; username: string; avatarUrl: string | null };
  /** Whether the viewer owns it - they get the routine itself, not a copy. */
  isOwn: boolean;
  todoCount: number;
  todoItems: { id: string; title: string; dueDate: string | null }[];
}

export interface RoutinePreviewState {
  preview?: RoutinePreview;
  isLoading: boolean;
  loadError?: string;
  reload: () => void;
  /** Copies it into the viewer's routines. Resolves to the copy, or null. */
  save: () => Promise<RoutineDetail | null>;
  isSaving: boolean;
  saveError?: string;
}

/**
 * Someone else's routine, opened from a post, and the one thing you can do
 * with it: take a copy.
 *
 * The copy is a new routine of your own (POST /api/routines/:id/clone) - every
 * task unticked, and a "Copied" badge on your list pointing back at where it
 * came from. The original is not touched, and later edits to either one stay
 * with that one.
 *
 * Both calls 404 when a block stands between you and the owner, exactly as
 * when the routine has been deleted - deliberately indistinguishable, so this
 * says "no longer exists" for both.
 */
export const useRoutinePreview = (routineId: string | undefined): RoutinePreviewState => {
  const [preview, setPreview] = useState<RoutinePreview | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!routineId) return;
    setIsLoading(true);
    try {
      setPreview(
        await withAuth((token) =>
          request<RoutinePreview>(`/api/routines/${routineId}/preview`, { token }),
        ),
      );
      setLoadError(undefined);
    } catch (err) {
      setLoadError(describeRoutineError(err, "Could not load this routine."));
    } finally {
      setIsLoading(false);
    }
  }, [routineId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    if (!routineId) return null;
    setIsSaving(true);
    setSaveError(undefined);
    try {
      return await withAuth((token) =>
        request<RoutineDetail>(`/api/routines/${routineId}/clone`, {
          method: "POST",
          token,
        }),
      );
    } catch (err) {
      setSaveError(describeRoutineError(err, "Could not save this routine. Try again."));
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [routineId]);

  return { preview, isLoading, loadError, reload: load, save, isSaving, saveError };
};
