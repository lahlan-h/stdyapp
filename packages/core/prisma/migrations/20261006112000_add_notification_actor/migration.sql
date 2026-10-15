-- Who caused a notification, when a person did: the follower, the liker, the
-- commenter, the person who joined. NULL for system events and for every row
-- raised before this column existed. SET NULL on delete, so an account going
-- away only stops other people's notifications linking to it.

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "actorId" TEXT;

-- CreateIndex
CREATE INDEX "notifications_actorId_idx" ON "notifications"("actorId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
