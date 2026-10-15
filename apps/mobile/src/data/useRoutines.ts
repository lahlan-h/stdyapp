import { useCallback, useEffect, useRef, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import {
  describeRoutineError,
  type Routine,
  type RoutineSummary,
} from "./routineTypes";

/** A row of GET /api/routines, before `_count` is mapped away. */
interface RoutineRow extends Routine {
  _count: { todoItems: number };
  completedCount: number;
}

export interface RoutinesState {
  routines?: RoutineSummary[];
  isLoading: boolean;
  loadError?: string;
  /** A failed create or delete. Separate from loadError so the list stays up. */
  actionError?: string;
  clearActionError: () => void;
  busy: boolean;
  reload: () => void;
  /** Resolves to the new routine, or undefined when the request failed. */
  create: (title: string) => Promise<RoutineSummary | undefined>;
  remove: (routineId: string) => Promise<boolean>;
}

/**
 * The signed-in user's routines, newest first, each with how many of its items
 * exist and how many are done.
 */
export const useRoutines = (): RoutinesState => {
  const [routines, setRoutines] = useState<RoutineSummary[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  /** Drops a slow response that a newer reload has already replaced. */
  const latest = useRef(0);

  /** The list as last rendered, for remove() to restore from. */
  const routinesRef = useRef(routines);
  routinesRef.current = routines;

  const load = useCallback(async () => {
    const requestId = ++latest.current;
    setIsLoading(true);
    try {
      const rows = await withAuth((token) =>
        request<RoutineRow[]>("/api/routines", { token }),
      );
      if (requestId !== latest.current) return;
      setRoutines(rows.map(({ _count, ...routine }) => ({
        ...routine,
        todoCount: _count.todoItems,
      })));
      setLoadError(undefined);
    } catch (err) {
      if (requestId !== latest.current) return;
      setLoadError(describeRoutineError(err, "Could not load your routines."));
    } finally {
      if (requestId === latest.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(async (title: string) => {
    const clean = title.trim();
    if (!clean) return undefined;

    setBusy(true);
    try {
      const routine = await withAuth((token) =>
        request<Routine>("/api/routines", {
          method: "POST",
          body: { title: clean },
          token,
        }),
      );
      // POST answers the bare row. A new routine has no items, so 0 and 0
      // are the truth rather than a guess.
      const summary: RoutineSummary = { ...routine, todoCount: 0, completedCount: 0 };
      setRoutines((prev) => [summary, ...(prev ?? [])]);
      setActionError(undefined);
      return summary;
    } catch (err) {
      setActionError(describeRoutineError(err, "Could not create the routine."));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Removed from the list first, put back if the server says no. */
  const remove = useCallback(async (routineId: string) => {
    // Read from the ref, not inside a setState updater: React may run an
    // updater later (or twice in StrictMode), so it cannot carry values out.
    const before = routinesRef.current ?? [];
    const index = before.findIndex((r) => r.id === routineId);
    const removed = before[index];
    setRoutines((prev) => prev?.filter((r) => r.id !== routineId));

    try {
      await withAuth((token) =>
        request<void>(`/api/routines/${routineId}`, { method: "DELETE", token }),
      );
      setActionError(undefined);
      return true;
    } catch (err) {
      if (removed) {
        setRoutines((prev) => {
          const next = [...(prev ?? [])];
          next.splice(Math.max(0, index), 0, removed);
          return next;
        });
      }
      setActionError(describeRoutineError(err, "Could not delete the routine."));
      return false;
    }
  }, []);

  const clearActionError = useCallback(() => setActionError(undefined), []);

  return {
    routines,
    isLoading,
    loadError,
    actionError,
    clearActionError,
    busy,
    reload: load,
    create,
    remove,
  };
};
