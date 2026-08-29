/**
 * Validates any combination of body / query / params against Zod schemas.
 *
 * Responds 400 DIRECTLY instead of calling next(err). The error middleware in
 * index.js only forwards { error: message } and has nowhere to carry per-field
 * detail, so short-circuiting here delivers rich errors while leaving that
 * middleware untouched. It is also arguably more correct: a malformed request
 * is a normal outcome, not an exception.
 *
 * Parsed output goes on req.validated, never back onto req.query. Express 5
 * makes req.query a getter-only property, so assigning to it works today and
 * silently breaks on upgrade. req.validated also makes it obvious at every call
 * site which data has actually been through a schema.
 */

// params and query before body so field errors read outside-in.
const VALIDATED_SOURCES = ["params", "query", "body"];

/**
 * Flattens a ZodError into a client-friendly list.
 *
 * issue.path is [] for object-level failures (the "at least one field" refine,
 * for instance), so fall back to the source name rather than emitting an empty
 * field.
 *
 * @param {import("zod").ZodError} error
 * @param {string} source - one of VALIDATED_SOURCES
 * @returns {Array<{ source: string, field: string, message: string, code: string }>}
 */
const toFieldIssues = (error, source) =>
  error.issues.map((issue) => ({
    source,
    field: issue.path.join(".") || source,
    message: issue.message,
    code: issue.code,
  }));

/**
 * @param {{ body?: import("zod").ZodType, query?: import("zod").ZodType, params?: import("zod").ZodType }} schemas
 * @returns {import("express").RequestHandler}
 */
export const validate = (schemas) => (req, res, next) => {
  const validated = {};
  const details = [];

  // Collect ALL failures across every source before responding. Reporting one
  // field at a time would make a client fix a bad request over five round
  // trips.
  for (const source of VALIDATED_SOURCES) {
    const schema = schemas[source];
    if (!schema) continue;

    const result = schema.safeParse(req[source]);
    if (result.success) {
      validated[source] = result.data;
    } else {
      details.push(...toFieldIssues(result.error, source));
    }
  }

  if (details.length > 0) {
    return res.status(400).json({ error: "Validation failed", details });
  }

  req.validated = validated;
  next();
};
