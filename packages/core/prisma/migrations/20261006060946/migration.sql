-- CreateEnum
CREATE TYPE "InterruptionType" AS ENUM ('APP_EXIT', 'DEVICE_MOTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "FocusSignal" AS ENUM ('MOTION', 'PRESENCE', 'HEART_RATE');

-- AlterTable
ALTER TABLE "session_interruptions" ADD COLUMN     "type" "InterruptionType";

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "completionFactor" DOUBLE PRECISION,
ADD COLUMN     "focusScore" INTEGER,
ADD COLUMN     "focusWeightedMinutes" DOUBLE PRECISION,
ADD COLUMN     "hadWatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "plannedMinutes" INTEGER,
ADD COLUMN     "tasksCompleted" INTEGER,
ADD COLUMN     "tasksTotal" INTEGER;

-- CreateTable
CREATE TABLE "session_tasks" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_samples" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hr" INTEGER,
    "motionVariance" DOUBLE PRECISION NOT NULL,
    "inApp" BOOLEAN NOT NULL,
    "computedFocus" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "focus_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_ratings" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selfRating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "focus_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_calibrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offset" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "focus_calibrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_baselines" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signal" "FocusSignal" NOT NULL,
    "mean" DOUBLE PRECISION NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "isCalibrated" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "focus_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_tasks_sessionId_position_idx" ON "session_tasks"("sessionId", "position");

-- CreateIndex
CREATE INDEX "focus_samples_sessionId_timestamp_idx" ON "focus_samples"("sessionId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "focus_ratings_sessionId_key" ON "focus_ratings"("sessionId");

-- CreateIndex
CREATE INDEX "focus_ratings_userId_idx" ON "focus_ratings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "focus_calibrations_userId_key" ON "focus_calibrations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "focus_baselines_userId_signal_key" ON "focus_baselines"("userId", "signal");

-- AddForeignKey
ALTER TABLE "session_tasks" ADD CONSTRAINT "session_tasks_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_samples" ADD CONSTRAINT "focus_samples_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_ratings" ADD CONSTRAINT "focus_ratings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_ratings" ADD CONSTRAINT "focus_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_calibrations" ADD CONSTRAINT "focus_calibrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "focus_baselines" ADD CONSTRAINT "focus_baselines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
