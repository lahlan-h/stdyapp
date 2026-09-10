/*
  Warnings:

  - You are about to drop the column `displayName` on the `users` table. All the data in the column will be lost.

  No backfill: `displayName` was added six days earlier (20260828023820) and
  only ever held development data.
*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "displayName",
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;
