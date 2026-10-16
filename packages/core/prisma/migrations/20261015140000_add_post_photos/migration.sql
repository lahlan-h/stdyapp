/*
  Moves post photos into their own table, for posts with several photos.

  posts.photoUrl held at most one photo. post_photos holds up to four per post,
  in order, and also holds uploads that are not attached to a post yet - the
  app uploads straight to R2 and the post is created afterwards. See the
  PostPhoto model in schema.prisma.

  Every existing photo is copied across as its post's first photo, BEFORE the
  old column is dropped, so no post loses its image. width and height stay null
  for those: the app measures an image itself when they are missing.
*/

-- CreateTable
CREATE TABLE "post_photos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_photos_postId_position_idx" ON "post_photos"("postId", "position");

-- CreateIndex
CREATE INDEX "post_photos_postId_createdAt_idx" ON "post_photos"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "post_photos" ADD CONSTRAINT "post_photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_photos" ADD CONSTRAINT "post_photos_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: each existing photo becomes its post's first photo.
INSERT INTO "post_photos" ("id", "userId", "postId", "url", "position", "createdAt")
SELECT gen_random_uuid()::text, "userId", "id", "photoUrl", 0, "createdAt"
FROM "posts"
WHERE "photoUrl" IS NOT NULL;

-- Only now, with every photo copied.
ALTER TABLE "posts" DROP COLUMN "photoUrl";
