import { ApiError } from "./api";

/**
 * Shared by useRoutines and useRoutine: the shapes the screens see, and the
 * wording for a failed request.
 *
 * Screens never see `_count` - the list hook maps it to `todoCount` - for the
 * seam rule in src/data/index.ts.
 */

/** Mirrors MAX_ROUTINE_TITLE_LENGTH in studyRoutine.validation.js. */
export const MAX_ROUTINE_TITLE_LENGTH = 100;

/** Mirrors MAX_TODO_TITLE_LENGTH in studyRoutine.validation.js. */
export const MAX_TODO_TITLE_LENGTH = 200;

/** One todo item, as the API answers it. Dates are ISO strings. */
export interface TodoItem {
  id: string;
  routineId: string;
  title: string;
  dueDate: string | null;
  isComplete: boolean;
  /** 0 first. The API orders items by this, so the screen never sorts. */
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** A routine row, without its items. */
export interface Routine {
  id: string;
  userId: string;
  /** Set when this routine was cloned from someone else's. */
  sourceRoutineId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** A row of GET /api/routines. */
export interface RoutineSummary extends Routine {
  todoCount: number;
  completedCount: number;
}

/** GET /api/routines/:id - the routine with its items, in position order. */
export interface RoutineDetail extends Routine {
  todoItems: TodoItem[];
}

/**
 * The end of a local day, as an ISO instant.
 *
 * A due date picked as "Today" means "by tonight" in the user's own zone. End
 * of day rather than midnight, so a task due today is not overdue at 12:01am.
 *
 * @param offsetDays - 0 for today, 1 for tomorrow, and so on.
 */
export const endOfLocalDay = (offsetDays: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(23, 59, 59, 0);
  return date.toISOString();
};

/** Turns a failed routine request into a sentence for the screen. */
export const describeRoutineError = (err: unknown, fallback: string): string => {
  if (!(err instanceof ApiError)) return fallback;

  switch (err.status) {
    case 404:
      return "This routine no longer exists.";
    case 403:
      return "You can only change your own routines.";
    case 429:
      return err.retryAfter
        ? `Slow down a little. Try again in ${err.retryAfter}s.`
        : "Slow down a little. Try again shortly.";
    default:
      return err.message;
  }
};
