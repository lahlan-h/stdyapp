import { z } from "zod";

/**
 * Request schemas for the study routines resource, todo items included.
 *
 * Conventions follow user.validation.js: strictObject everywhere, so an
 * unrecognised key is a loud 400 rather than a silent no-op. As with groups
 * that matters more than usual - updateTodoItem destructures its input but
 * updateRoutine passes { title } through, and before this schema existed a
 * client could send anything at all.
 */

// study_routines.title and todo_items.title are both TEXT with no constraint in
// the Prisma schema, so these are the only thing bounding the columns.
const MAX_ROUTINE_TITLE_LENGTH = 100;
const MAX_TODO_TITLE_LENGTH = 200;

const routineTitleSchema = z
  .string()
  .trim()
  .min(1, "title must not be empty")
  .max(
    MAX_ROUTINE_TITLE_LENGTH,
    `title must be at most ${MAX_ROUTINE_TITLE_LENGTH} characters`,
  );

const todoTitleSchema = z
  .string()
  .trim()
  .min(1, "title must not be empty")
  .max(
    MAX_TODO_TITLE_LENGTH,
    `title must be at most ${MAX_TODO_TITLE_LENGTH} characters`,
  );

/**
 * A due date, as it arrives in JSON.
 *
 * z.coerce.date() accepts an ISO string and hands the service a real Date,
 * which is what Prisma wants for a DateTime column. Without it, a string went
 * straight through createTodoItem to Prisma, which rejects it at runtime with
 * an error nothing in the middleware translates - so a mistyped date was a 500.
 *
 * .nullish() rather than .optional() for the reason descriptionSchema gives in
 * studyGroup.validation.js: createTodoItem already writes `dueDate ?? null`, so
 * both spellings of "no due date" were accepted before, and null is also how an
 * update CLEARS one.
 *
 * Deliberately NOT bounded to the future. Backdating a task you meant to finish
 * last week is legitimate, and a past-date check here would reject it.
 */
const dueDateSchema = z.coerce
  .date({ message: "dueDate must be a valid date" })
  .nullish();

/**
 * study_routines.id and todo_items.id are both TEXT in Postgres, so an invalid
 * id would otherwise just miss and return a confusing 404 - see
 * sessionIdParamSchema.
 */
export const routineIdParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
});

/** The two-segment todo routes: PATCH and DELETE under /:id/todos/:todoId. */
export const routineTodoParamSchema = z.strictObject({
  id: z.uuid("id must be a UUID"),
  todoId: z.uuid("todoId must be a UUID"),
});

/**
 * POST /api/routines.
 *
 * userId is ABSENT by design - the controller takes it from req.user.id.
 * sourceRoutineId is absent too, and that one is an access-control boundary
 * rather than a convenience: createRoutine hardcodes it to null, and cloning is
 * POST /:id/clone, which is the only path that sets it. A client able to set it
 * here could forge provenance, claiming any routine as the source of its own.
 */
export const createRoutineSchema = z.strictObject({
  title: routineTitleSchema,
});

/**
 * PATCH /api/routines/:id.
 *
 * Only the title is editable, matching what updateRoutine actually destructures.
 * Before this schema the extra keys were dropped silently one layer down; now
 * strictObject says so.
 *
 * The refine is what stops an empty body returning 200 having changed nothing.
 * With a single optional field it is doing real work - `{}` is the only other
 * thing this schema would otherwise accept.
 */
export const updateRoutineSchema = z
  .strictObject({
    title: routineTitleSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "request body must contain at least one field to update",
  });

/**
 * POST /api/routines/:id/todos.
 *
 * isComplete is ABSENT: a task being created is not a task already done, and
 * the column defaults to false. Sending it is a 400 rather than a silent
 * no-op - addTodoItem destructures only { title, dueDate }, so before this it
 * was accepted and dropped.
 */
export const createTodoItemSchema = z.strictObject({
  title: todoTitleSchema,
  dueDate: dueDateSchema,
});

/**
 * PATCH /api/routines/:id/todos/:todoId.
 *
 * isComplete IS editable here - ticking a task off is the whole point of the
 * route - and routineId is not: moving a task between routines through a PATCH
 * would need an ownership check on the destination that updateTodoItem does not
 * do, so it is a 400 rather than an unchecked write.
 */
export const updateTodoItemSchema = z
  .strictObject({
    title: todoTitleSchema.optional(),
    dueDate: dueDateSchema,
    isComplete: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "request body must contain at least one field to update",
  });
