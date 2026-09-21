/*
  Adds reports.details — the reporter's own words.

  Nullable with no backfill, and no default. Every existing row was filed under a
  reason that stands on its own, so NULL is the honest value for all of them:
  "no explanation was given" rather than an empty string pretending one was.

  The length cap is deliberately NOT a CHECK here. It lives at the edge, in
  MAX_REPORT_DETAILS in apps/api/src/validation/report.validation.js, for the
  same reason the reason vocabulary does — a moderation limit that will be argued
  about should not need a migration to move.

  The "required when reason is OTHER" rule is likewise enforced in
  createReportSchema rather than by a CHECK, and that is a weaker guarantee than
  the reports_target_xor CHECK next door. The difference is intentional: the XOR
  protects the table's integrity model, where a violating row is nonsense, while
  this one protects data quality, where a violating row is merely unhelpful — and
  PATCH /api/reports/:id can already move an existing report to OTHER without
  supplying any.
*/
-- AlterTable
ALTER TABLE "reports" ADD COLUMN "details" TEXT;
