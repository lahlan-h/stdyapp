/*
  Adds posts.title, and makes posts.caption optional.

  The caption carried the post's headline before this column existed - the feed
  card rendered it as the bold line - so it is MOVED, not copied: each row's
  caption becomes its title and the caption is cleared. Copying would print the
  same sentence twice on every card that predates this.

  Three statements rather than Prisma's generated one, which was
  `ADD COLUMN "title" TEXT NOT NULL` and cannot land on a table that already has
  rows and no default to fill them with. Add nullable, backfill, then tighten.
*/
-- AlterTable
ALTER TABLE "posts" ADD COLUMN "title" TEXT;

UPDATE "posts" SET "title" = "caption";

ALTER TABLE "posts" ALTER COLUMN "title" SET NOT NULL;

-- The caption's text now lives in title, so the column is both optional and
-- empty for every existing row.
ALTER TABLE "posts" ALTER COLUMN "caption" DROP NOT NULL;

UPDATE "posts" SET "caption" = NULL;
