-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_routineId_fkey";

-- DropForeignKey
ALTER TABLE "posts" DROP CONSTRAINT "posts_sessionId_fkey";

-- AlterTable
ALTER TABLE "posts" ALTER COLUMN "sessionId" DROP NOT NULL,
ALTER COLUMN "routineId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "study_routines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
