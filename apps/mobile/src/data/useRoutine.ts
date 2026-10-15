import { useCallback, useEffect, useRef, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import {
  describeRoutineError,
  type Routine,
  type RoutineDetail,
  type TodoItem,
} from "./routineTypes";

/** The fields PATCH /api/routines/:id/todos/:todoId accepts. */
export interface TodoEdit {
  title?: string;
  /** null clears the due date. */
  dueDate?: string | null;
  isComplete?: boolean;
}

export interface RoutineState {
  routine?: RoutineDetail;
  isLoading: boolean;
  loadError?: string;
  /** A failed write. The routine stays on screen; the next load corrects it. */
  actionError?: string;
  clearActionError: () => void;
  reload: () => void;
  rename: (title: string) => Promise<boolean>;
  remove: () => Promise<boolean>;
  addTodo: (title: string, dueDate?: string | null) => Promise<boolean>;
  toggleTodo: (todo: TodoItem) => void;
  editTodo: (todoId: string, edit: TodoEdit) => void;
  removeTodo: (todoId: string) => void;
  /** Swaps an item with its neighbour. Does nothing at either end. */
  moveTodo: (todoId: string, direction: "up" | "down") => void;
  /** Unticks every item. Resolves false when the request failed. */
  resetAll: () => Promise<boolean>;
}

/**
 * One of the caller's routines, with its todo items.
 *
 * Todo writes are OPTIMISTIC: ticking a box is one tap and the request is a
 * detail. When a write fails the screen does not try to undo it by hand -
 * after two quick taps on the same box there is no single "before" to go back
 * to. It reloads from the server instead, which is always right.
 *
 * Ticks and moves have their own 60-a-minute limit on the API. A 429 still
 * shows as actionError, and the reload puts the list back to what the server
 * holds.
 */
export const useRoutine = (routineId: string | undefined): RoutineState => {
  const [routine, setRoutine] = useState<RoutineDetail | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  const latest = useRef(0);
  const base = `/api/routines/${routineId}`;

  const load = useCallback(async () => {
    if (!routineId) return;
    const requestId = ++latest.current;
    setIsLoading(true);
    try {
      const data = await withAuth((token) => request<RoutineDetail>(base, { token }));
      if (requestId !== latest.current) return;
      setRoutine(data);
      setLoadError(undefined);
    } catch (err) {
      if (requestId !== latest.current) return;
      setLoadError(describeRoutineError(err, "Could not load this routine."));
    } finally {
      if (requestId === latest.current) setIsLoading(false);
    }
  }, [routineId, base]);

  useEffect(() => {
    load();
  }, [load]);

  /** Shows the error and resyncs with the server. */
  const fail = useCallback(
    (err: unknown, fallback: string) => {
      setActionError(describeRoutineError(err, fallback));
      load();
    },
    [load],
  );

  const patchTodoLocally = (todoId: string, edit: Partial<TodoItem>) =>
    setRoutine((prev) =>
      prev && {
        ...prev,
        todoItems: prev.todoItems.map((t) => (t.id === todoId ? { ...t, ...edit } : t)),
      },
    );

  const rename = useCallback(
    async (title: string) => {
      const clean = title.trim();
      if (!clean) return false;
      try {
        const updated = await withAuth((token) =>
          request<Routine>(base, { method: "PATCH", body: { title: clean }, token }),
        );
        // PATCH answers the bare row, so keep the items already on screen.
        setRoutine((prev) => prev && { ...prev, ...updated });
        setActionError(undefined);
        return true;
      } catch (err) {
        setActionError(describeRoutineError(err, "Could not rename the routine."));
        return false;
      }
    },
    [base],
  );

  const remove = useCallback(async () => {
    try {
      await withAuth((token) => request<void>(base, { method: "DELETE", token }));
      return true;
    } catch (err) {
      setActionError(describeRoutineError(err, "Could not delete the routine."));
      return false;
    }
  }, [base]);

  /** Not optimistic: the new row needs the id the server gives it. */
  const addTodo = useCallback(
    async (title: string, dueDate?: string | null) => {
      const clean = title.trim();
      if (!clean) return false;
      try {
        const todo = await withAuth((token) =>
          request<TodoItem>(`${base}/todos`, {
            method: "POST",
            // dueDate left out entirely when there is none, rather than sent
            // as null - both are accepted, but absent says "not set".
            body: dueDate ? { title: clean, dueDate } : { title: clean },
            token,
          }),
        );
        setRoutine((prev) => prev && { ...prev, todoItems: [...prev.todoItems, todo] });
        setActionError(undefined);
        return true;
      } catch (err) {
        setActionError(describeRoutineError(err, "Could not add the task."));
        return false;
      }
    },
    [base],
  );

  const editTodo = useCallback(
    (todoId: string, edit: TodoEdit) => {
      patchTodoLocally(todoId, edit);
      withAuth((token) =>
        request<TodoItem>(`${base}/todos/${todoId}`, { method: "PATCH", body: edit, token }),
      ).catch((err) => fail(err, "Could not save that change."));
    },
    [base, fail],
  );

  const toggleTodo = useCallback(
    (todo: TodoItem) => editTodo(todo.id, { isComplete: !todo.isComplete }),
    [editTodo],
  );

  const removeTodo = useCallback(
    (todoId: string) => {
      setRoutine((prev) =>
        prev && { ...prev, todoItems: prev.todoItems.filter((t) => t.id !== todoId) },
      );
      withAuth((token) =>
        request<void>(`${base}/todos/${todoId}`, { method: "DELETE", token }),
      ).catch((err) => fail(err, "Could not remove the task."));
    },
    [base, fail],
  );

  /**
   * Sends the WHOLE new order, which is what the API asks for: a partial list
   * is refused, so a stale screen cannot scramble the order - it gets a 400 and
   * reloads instead.
   *
   * The order is worked out from a ref of the last rendered routine rather than
   * inside the state updater, which React may run late or twice.
   */
  const routineRef = useRef(routine);
  routineRef.current = routine;

  const moveTodo = useCallback(
    (todoId: string, direction: "up" | "down") => {
      const items = routineRef.current?.todoItems;
      if (!items) return;
      const from = items.findIndex((t) => t.id === todoId);
      const to = direction === "up" ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= items.length) return;

      const next = [...items];
      [next[from], next[to]] = [next[to], next[from]];
      setRoutine((prev) => prev && { ...prev, todoItems: next });

      withAuth((token) =>
        request<RoutineDetail>(`${base}/todos/order`, {
          method: "PUT",
          body: { todoIds: next.map((t) => t.id) },
          token,
        }),
      ).catch((err) => fail(err, "Could not move that task."));
    },
    [base, fail],
  );

  /** One request for the lot; the answer is the routine as it now stands. */
  const resetAll = useCallback(async () => {
    try {
      const data = await withAuth((token) =>
        request<RoutineDetail>(`${base}/reset`, { method: "POST", body: {}, token }),
      );
      setRoutine(data);
      setActionError(undefined);
      return true;
    } catch (err) {
      setActionError(describeRoutineError(err, "Could not start the routine again."));
      return false;
    }
  }, [base]);

  const clearActionError = useCallback(() => setActionError(undefined), []);

  return {
    routine,
    isLoading,
    loadError,
    actionError,
    clearActionError,
    reload: load,
    rename,
    remove,
    addTodo,
    toggleTodo,
    editTodo,
    removeTodo,
    moveTodo,
    resetAll,
  };
};
