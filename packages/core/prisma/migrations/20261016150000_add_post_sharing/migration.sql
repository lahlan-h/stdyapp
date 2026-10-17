/*
  Lets a post be shared to its author's followers, to their study groups, or
  both - see Post.shareToFollowers and PostGroupShare in schema.prisma.

  Every existing post stays shared to followers (the column's default), which
  is where every post went before. Each existing post about a GROUP session is
  also shared to that group, provided its author is still a member - a group's
  feed now shows only what was shared to it, and those are the posts that
  plainly belonged there.
*/

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "shareToFollowers" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "post_group_shares" (
    "postId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_group_shares_pkey" PRIMARY KEY ("postId","groupId")
);

-- CreateIndex
CREATE INDEX "post_group_shares_groupId_idx" ON "post_group_shares"("groupId");

-- AddForeignKey
ALTER TABLE "post_group_shares" ADD CONSTRAINT "post_group_shares_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_group_shares" ADD CONSTRAINT "post_group_shares_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: group-session posts go to their group, if the author is still in it.
INSERT INTO "post_group_shares" ("postId", "groupId", "createdAt")
SELECT p."id", s."groupId", p."createdAt"
FROM "posts" p
JOIN "sessions" s ON s."id" = p."sessionId"
JOIN "group_memberships" m ON m."groupId" = s."groupId" AND m."userId" = p."userId"
WHERE s."groupId" IS NOT NULL;
