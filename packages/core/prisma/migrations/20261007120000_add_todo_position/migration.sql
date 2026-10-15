-- AlterTable
ALTER TABLE "todo_items" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: number existing items 0,1,2... per routine in their current order
UPDATE "todo_items" AS t
SET "position" = ranked.rn
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "routineId" ORDER BY "createdAt", "id") - 1 AS rn
  FROM "todo_items"
) AS ranked
WHERE t."id" = ranked."id";

-- CreateIndex
CREATE INDEX "todo_items_routineId_position_idx" ON "todo_items"("routineId", "position");
