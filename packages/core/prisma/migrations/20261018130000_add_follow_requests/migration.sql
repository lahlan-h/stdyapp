/*
  Follow requests, for private accounts - see FollowRequest in schema.prisma.

  Following a private account now asks first: the request waits here until the
  account accepts it (it becomes a row in follows) or declines it. Two new
  notification types go with it: FOLLOW_REQUEST, which the account answers from,
  and FOLLOW_ACCEPTED, which tells the requester they are in.

  Both enum values in one migration. Prisma warns against that for Postgres
  older than 12, which cannot add an enum value inside a transaction at all;
  every database this app runs on is newer, and neither value is USED in this
  transaction, which is the rule that still applies.
*/

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_ACCEPTED';

-- CreateTable
CREATE TABLE "follow_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_requests_targetId_createdAt_idx" ON "follow_requests"("targetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "follow_requests_requesterId_targetId_key" ON "follow_requests"("requesterId", "targetId");

-- AddForeignKey
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_requests" ADD CONSTRAINT "follow_requests_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
