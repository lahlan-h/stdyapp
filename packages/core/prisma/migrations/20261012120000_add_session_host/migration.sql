-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "hostSessionId" TEXT;

-- CreateIndex
CREATE INDEX "sessions_hostSessionId_idx" ON "sessions"("hostSessionId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_hostSessionId_fkey" FOREIGN KEY ("hostSessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
