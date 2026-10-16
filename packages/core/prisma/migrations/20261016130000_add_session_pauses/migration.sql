/*
  Lets a study session take breaks.

  Three columns on sessions: the moment a running break began, how many breaks
  the session has started, and the credited seconds of every finished one. See
  the note on Session in schema.prisma, and apps/api/src/services/sessionPause.js
  for the rules - three breaks of up to five minutes.

  No backfill: every existing session took no breaks, which is exactly what the
  defaults say. NOT NULL with a DEFAULT, so Postgres fills existing rows itself
  and the ADD COLUMN is metadata-only on PG 11+.
*/

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pauseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pausedSeconds" INTEGER NOT NULL DEFAULT 0;
