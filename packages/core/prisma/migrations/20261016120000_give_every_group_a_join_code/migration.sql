/*
  Gives every study group a join code, and makes each code name one group.

  A code used to exist only for private groups, as the second half of
  "join this group": you found the group, then proved you had its code. Now a
  code on its own is how anyone joins any group - type it on the Study tab - so
  every group needs one, and no two may share one.

  Groups that already have a code KEEP it: people may have shared it. Only
  missing codes are generated, plus a fresh one for any group whose code a
  group before it already took. New codes use the alphabet in
  apps/api/src/services/joinCode.js - no I, O, 0 or 1, the characters people
  misread - generated the same way, and retried until unique.

  Then the column is NOT NULL and UNIQUE. The unique index is also the lookup
  POST /api/groups/join does, so it needs no other index.
*/

DO $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  grp RECORD;
  candidate TEXT;
BEGIN
  -- Oldest first, so on a duplicate the group that had the code first keeps it.
  FOR grp IN
    SELECT g."id"
    FROM "study_groups" g
    WHERE g."joinCode" IS NULL
       OR EXISTS (
         SELECT 1 FROM "study_groups" earlier
         WHERE earlier."joinCode" = g."joinCode"
           AND (earlier."createdAt", earlier."id") < (g."createdAt", g."id")
       )
    ORDER BY g."createdAt", g."id"
  LOOP
    LOOP
      candidate := '';
      FOR i IN 1..6 LOOP
        candidate := candidate || substr(alphabet, 1 + floor(random() * 32)::INT, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "study_groups" WHERE "joinCode" = candidate);
    END LOOP;
    UPDATE "study_groups" SET "joinCode" = candidate WHERE "id" = grp."id";
  END LOOP;
END $$;

-- AlterTable
ALTER TABLE "study_groups" ALTER COLUMN "joinCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "study_groups_joinCode_key" ON "study_groups"("joinCode");
