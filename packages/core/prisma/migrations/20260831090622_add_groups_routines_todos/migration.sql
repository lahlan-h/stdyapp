/*
  Warnings:

  - A unique constraint covering the columns `[inviteCode]` on the table `sessions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "inviteCode" TEXT;

-- CreateTable
CREATE TABLE "study_groups" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "joinCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_routines" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceRoutineId" TEXT,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_items" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todo_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_memberships_userId_groupId_key" ON "group_memberships"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_inviteCode_key" ON "sessions"("inviteCode");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_groups" ADD CONSTRAINT "study_groups_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_routines" ADD CONSTRAINT "study_routines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_routines" ADD CONSTRAINT "study_routines_sourceRoutineId_fkey" FOREIGN KEY ("sourceRoutineId") REFERENCES "study_routines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "study_routines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
