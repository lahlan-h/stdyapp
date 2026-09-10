-- DropForeignKey
ALTER TABLE "session_interruptions" DROP CONSTRAINT "session_interruptions_sessionId_fkey";

-- AddForeignKey
ALTER TABLE "session_interruptions" ADD CONSTRAINT "session_interruptions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
