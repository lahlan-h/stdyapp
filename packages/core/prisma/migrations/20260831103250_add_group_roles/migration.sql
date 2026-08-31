-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('MEMBER', 'ADMIN');

-- AlterTable
ALTER TABLE "group_memberships" ADD COLUMN     "role" "GroupRole" NOT NULL DEFAULT 'MEMBER';
