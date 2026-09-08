/*
  Adds the two account flags on users.

  No backfill: both columns are NOT NULL with DEFAULT false, so Postgres fills
  every existing row itself and the ADD COLUMN is metadata-only on PG 11+.

  Neither flag is enforced anywhere yet — this migration only creates the
  columns. isPrivate is writable by its owner through PATCH /api/users/:id;
  isSuspended has no write path in the API at all and is set out of band.
*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false;
