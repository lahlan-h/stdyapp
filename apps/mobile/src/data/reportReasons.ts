/**
 * The report vocabulary, mirroring REPORT_REASONS in the API's
 * report.validation.js.
 *
 * Mirrored rather than fetched for MAX_COMMENT_LENGTH's reason: the list is
 * closed, it changes about once a year, and a round trip to learn it would make
 * the report dialog wait on the network before it could draw a single row.
 *
 * VALUES ONLY. The labels a person reads live in the dialog that renders them -
 * these seven strings are the API's vocabulary, and wording is not this layer's
 * business.
 *
 * A file of its own rather than a corner of useReportPost, because both
 * types.ts and that hook need it: FeedPost carries the reason of the viewer's
 * own report, and a type-only import back from the hook would tie the shape of
 * a post to the module that files one.
 */
export const REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "HATE_SPEECH",
  "NUDITY",
  "MISINFORMATION",
  "SELF_HARM",
  "OTHER",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * The one reason that carries no complaint on its own, and so demands details.
 *
 * Named rather than indexed off the end of the list: "the last reason" stops
 * being true the moment somebody reorders it, and the failure would be a dialog
 * that silently stops asking for the one explanation a moderator needs.
 * createReportSchema enforces the same rule server-side, so this is the client
 * being helpful rather than the client being trusted.
 */
export const DETAILED_REASON: ReportReason = "OTHER";

/** Mirrors MAX_REPORT_DETAILS in report.validation.js; drives the counter. */
export const MAX_REPORT_DETAILS = 200;
