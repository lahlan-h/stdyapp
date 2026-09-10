-- DropForeignKey
ALTER TABLE "group_memberships" DROP CONSTRAINT "group_memberships_groupId_fkey";

-- DropForeignKey
ALTER TABLE "todo_items" DROP CONSTRAINT "todo_items_routineId_fkey";

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "study_routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
