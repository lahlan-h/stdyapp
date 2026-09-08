-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetPostId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_reporterId_createdAt_idx" ON "reports"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "reports_targetUserId_idx" ON "reports"("targetUserId");

-- CreateIndex
CREATE INDEX "reports_targetPostId_idx" ON "reports"("targetPostId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporterId_targetUserId_key" ON "reports"("reporterId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporterId_targetPostId_key" ON "reports"("reporterId", "targetPostId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_targetPostId_fkey" FOREIGN KEY ("targetPostId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- HAND-WRITTEN, and the only statement in this file Prisma did not generate.
--
-- A report names a user OR a post, never both and never neither. Prisma's schema
-- language cannot express that, so the schema declares two nullable foreign keys
-- and the rule itself lives here. It is re-stated in createReportSchema
-- (apps/api/src/validation/report.validation.js) and again in fileReport
-- (apps/api/src/services/report.service.js) — three places, because this one is
-- the only one that cannot be bypassed and those two are the only ones that can
-- produce an error message worth reading.
--
-- <> rather than a pair of ORed AND clauses: on two non-null booleans it IS
-- exclusive-or, and it stays readable. Both operands are IS NULL tests, so
-- neither can be NULL itself and the constraint can never evaluate to unknown --
-- which is the way a CHECK silently passes.
--
-- Kept INSIDE this migration rather than applied by hand to the database, so
-- replaying the migrations into a shadow database reproduces it. That is what
-- stops it registering as drift on the next `prisma migrate dev`.
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_xor"
    CHECK (("targetUserId" IS NULL) <> ("targetPostId" IS NULL));
