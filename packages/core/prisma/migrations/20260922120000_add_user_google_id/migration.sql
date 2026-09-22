/*
  Adds users.googleId, the Google subject id of an account that has signed in
  with Google.

  Nullable, so it lands on a populated table with no backfill - every existing
  row simply has no Google link yet. Unique so one Google account can never map
  to two users; Postgres allows any number of NULLs under a unique index, so the
  accounts that never use Google do not collide with each other.
*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
