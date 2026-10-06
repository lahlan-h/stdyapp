import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Integration tests for the focus feature: real Prisma, real Postgres, no mocks.
 *
 * SKIPPED unless TEST_DATABASE_URL is set, so `npm test` stays fast and needs
 * no database. Run them with:
 *
 *   npm run test:integration -w @stdyapp/api
 *
 * which creates a throwaway database, pushes the schema into it and sets the
 * variable. NEVER point TEST_DATABASE_URL at Supabase - these tests write and
 * delete rows.
 *
 * DATABASE_URL is assigned before the dynamic imports below because
 * packages/core/src/db.js constructs its PrismaClient at import time, so a
 * static import would bind to whatever .env happened to hold.
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : "TEST_DATABASE_URL not set";

let prisma, focusService, sessionService, focusRepo, closeRedis, closeRabbitMq;
let userId, otherUserId;

if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.DIRECT_URL = TEST_DB;
  ({ prisma, closeRedis, closeRabbitMq } = await import("@stdyapp/core"));
  focusService = await import("../../src/services/focus.service.js");
  sessionService = await import("../../src/services/session.service.js");
  focusRepo = await import("../../src/repositories/focus.repository.js");
}

/**
 * Deletes a test user and everything hanging off them.
 *
 * Sessions must go FIRST and explicitly: sessions.userId is RESTRICT, not
 * Cascade, because a study session is a historical record the schema protects
 * from an accidental user delete. Focus samples, ratings and interruptions all
 * cascade from the session, so removing sessions clears them too.
 */
const destroyUser = async (id) => {
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.focusBaseline.deleteMany({ where: { userId: id } });
  await prisma.focusCalibration.deleteMany({ where: { userId: id } });
  await prisma.block.deleteMany({
    where: { OR: [{ blockerId: id }, { blockedId: id }] },
  });
  await prisma.user.delete({ where: { id } }).catch(() => {});
};

/** A user owned by this run, so parallel runs cannot collide. */
const makeUser = async (suffix) => {
  const user = await prisma.user.create({
    data: {
      email: `focus-${suffix}-${randomUUID()}@test.local`,
      username: `focus_${suffix}_${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
    },
    select: { id: true },
  });
  return user.id;
};

const startedMinutesAgo = (m) => new Date(Date.now() - m * 60_000);

/** A session that already ran for `minutes`, ready to be ended. */
const openSession = async (ownerId, { minutes = 60, plannedMinutes = null } = {}) => {
  const s = await prisma.session.create({
    data: { userId: ownerId, startedAt: startedMinutesAgo(minutes), plannedMinutes },
    select: { id: true },
  });
  return s.id;
};

describe("focus feature against a real database", { skip }, () => {
  before(async () => {
    userId = await makeUser("owner");
    otherUserId = await makeUser("other");
  });

  after(async () => {
    // try/finally, because a failed cleanup must not skip the closes below:
    // an open Redis handle keeps the event loop alive and the run hangs with
    // no output rather than failing.
    try {
      await destroyUser(userId);
      await destroyUser(otherUserId);
    } finally {
      await Promise.allSettled([prisma.$disconnect(), closeRedis(), closeRabbitMq()]);
    }
  });

  it("stores samples with a server-computed score the client cannot set", async () => {
    const sessionId = await openSession(userId);

    const result = await focusService.ingestSamples(sessionId, userId, [
      { motionVariance: 0.1, inApp: true },
      { motionVariance: 0.1, inApp: true },
    ]);
    assert.equal(result.inserted, 2);

    const rows = await focusRepo.findSamplesBySession(sessionId);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.ok(row.computedFocus > 0 && row.computedFocus <= 1, "score out of range");
    }
  });

  it("refuses samples on someone else's session", async () => {
    const sessionId = await openSession(userId);
    await assert.rejects(
      () => focusService.ingestSamples(sessionId, otherUserId, [
        { motionVariance: 0.1, inApp: true },
      ]),
      (err) => err.status === 403,
    );
  });

  it("404s for a session that does not exist", async () => {
    await assert.rejects(
      () => focusService.getSessionFocus(randomUUID(), userId),
      (err) => err.status === 404,
    );
  });

  it("writes the estimate on end, and leaves focusPoints to the other feature", async () => {
    const sessionId = await openSession(userId, { minutes: 60, plannedMinutes: 60 });
    await focusService.ingestSamples(sessionId, userId, [
      { motionVariance: 0.08, inApp: true },
      { motionVariance: 0.09, inApp: true },
      { motionVariance: 0.1, inApp: true },
    ]);

    const ended = await sessionService.endSession(sessionId, userId);

    assert.ok(Number.isInteger(ended.focusScore), "focusScore should be an integer");
    assert.ok(ended.focusScore >= 0 && ended.focusScore <= 100);
    assert.ok(ended.focusWeightedMinutes > 0);
    // The whole point of the design: two independent numbers.
    assert.ok(Number.isInteger(ended.focusPoints));

    const row = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { focusScore: true, completionFactor: true, hadWatch: true },
    });
    assert.equal(row.focusScore, ended.focusScore, "score must be persisted, not just returned");
    assert.equal(row.hadWatch, false);
  });

  it("scores a session with time away below an identical one without", async () => {
    const build = async (awaySec) => {
      const id = await openSession(userId, { minutes: 60 });
      await focusService.ingestSamples(id, userId, [
        { motionVariance: 0.1, inApp: true },
        { motionVariance: 0.1, inApp: true },
      ]);
      if (awaySec) {
        await sessionService.logInterruption(id, userId, {
          durationSec: awaySec,
          type: "APP_EXIT",
        });
      }
      return (await sessionService.endSession(id, userId)).focusScore;
    };

    const present = await build(0);
    const away = await build(1800);
    assert.ok(away < present, `away ${away} should be below present ${present}`);
  });

  it("persists the interruption type", async () => {
    const sessionId = await openSession(userId);
    await sessionService.logInterruption(sessionId, userId, {
      durationSec: 30,
      type: "DEVICE_MOTION",
    });
    const rows = await prisma.sessionInterruption.findMany({ where: { sessionId } });
    assert.equal(rows[0].type, "DEVICE_MOTION");
  });

  it("scores a session with no samples as null, not zero", async () => {
    const sessionId = await openSession(userId, { minutes: 30 });
    const ended = await sessionService.endSession(sessionId, userId);
    assert.equal(ended.focusScore, null);
    assert.equal(ended.focusWeightedMinutes, null);
  });

  it("keeps one rating per session, replacing on resubmit", async () => {
    const sessionId = await openSession(userId);
    await focusService.rateSession(sessionId, userId, 2);
    await focusService.rateSession(sessionId, userId, 5);

    const rows = await prisma.focusRating.findMany({ where: { sessionId } });
    assert.equal(rows.length, 1, "a resubmission must update, not stack");
    assert.equal(rows[0].selfRating, 5);
  });

  it("accumulates a per-signal baseline across sessions", async () => {
    const before = await focusService.getBaselines(userId);
    const motionBefore =
      before.signals.find((s) => s.signal === "MOTION")?.sampleCount ?? 0;

    const sessionId = await openSession(userId, { minutes: 20 });
    await focusService.ingestSamples(
      sessionId,
      userId,
      Array.from({ length: 6 }, () => ({ motionVariance: 0.2, inApp: true })),
    );
    await sessionService.endSession(sessionId, userId);

    const after = await focusService.getBaselines(userId);
    const motionAfter = after.signals.find((s) => s.signal === "MOTION");
    assert.equal(motionAfter.sampleCount, motionBefore + 6);
    assert.ok(Number.isFinite(motionAfter.mean) && Number.isFinite(motionAfter.variance));
  });

  it("reports accuracy only once enough sessions are rated", async () => {
    const fresh = await makeUser("accuracy");
    try {
      const early = await focusService.getAccuracy(fresh);
      assert.equal(early.ready, false);
      assert.equal(early.meanAbsoluteError, null);

      for (let i = 0; i < 5; i += 1) {
        const id = await openSession(fresh, { minutes: 30 });
        await focusService.ingestSamples(id, fresh, [
          { motionVariance: 0.1, inApp: true },
          { motionVariance: 0.1, inApp: true },
        ]);
        await sessionService.endSession(id, fresh);
        await focusService.rateSession(id, fresh, 4);
      }

      const ready = await focusService.getAccuracy(fresh);
      assert.equal(ready.ready, true);
      assert.equal(ready.count, 5);
      assert.ok(Number.isFinite(ready.meanAbsoluteError));
      // Every rating identical, so there is nothing to correlate against.
      assert.equal(ready.correlation, null);
    } finally {
      await destroyUser(fresh);
    }
  });

  it("scores a finished checklist above an untouched one, and stores the counts", async () => {
    const run = async (done) => {
      const id = await openSession(userId, { minutes: 30 });
      await focusService.addTasks(id, userId, ["read", "notes", "practice", "recap"]);
      const tasks = await focusRepo.findTasksBySession(id);
      for (const t of tasks.slice(0, done)) {
        await focusService.setTaskComplete(id, userId, t.id, true);
      }
      await focusService.ingestSamples(id, userId, [
        { motionVariance: 0.1, inApp: true },
        { motionVariance: 0.1, inApp: true },
      ]);
      await sessionService.endSession(id, userId);
      return prisma.session.findUnique({
        where: { id },
        select: { focusScore: true, tasksTotal: true, tasksCompleted: true },
      });
    };

    const none = await run(0);
    const all = await run(4);

    assert.ok(
      all.focusScore > none.focusScore,
      `all-done ${all.focusScore} should beat none-done ${none.focusScore}`,
    );
    // Denormalised onto the row, which is what the leaderboard sums.
    assert.equal(all.tasksTotal, 4);
    assert.equal(all.tasksCompleted, 4);
    assert.equal(none.tasksCompleted, 0);
  });

  it("refuses checklist changes once the session has ended", async () => {
    // The score is already written, so a task ticked afterwards would claim
    // credit the score never counted.
    const id = await openSession(userId, { minutes: 10 });
    await focusService.addTasks(id, userId, ["one"]);
    await sessionService.endSession(id, userId);

    await assert.rejects(
      () => focusService.addTasks(id, userId, ["late"]),
      (err) => err.status === 409,
    );
  });

  it("moves the calibration offset towards the user's own verdicts", async () => {
    const learner = await makeUser("calibrate");
    try {
      const runAndRate = async (selfRating) => {
        const id = await openSession(learner, { minutes: 30 });
        await focusService.ingestSamples(id, learner, [
          { motionVariance: 0.1, inApp: true },
          { motionVariance: 0.1, inApp: true },
        ]);
        await sessionService.endSession(id, learner);
        await focusService.rateSession(id, learner, selfRating);
      };

      // Below the threshold nothing is corrected - four ratings is not evidence.
      for (let i = 0; i < 4; i += 1) await runAndRate(5);
      assert.equal((await focusRepo.findCalibration(learner))?.offset ?? 0, 0);

      // The fifth crosses it. Rating every session 5/5 against low estimates
      // means the score reads LOW, so the correction must go UP.
      await runAndRate(5);
      const first = await focusRepo.findCalibration(learner);
      assert.ok(first, "a calibration row should exist once rated enough");
      assert.ok(first.offset > 0, `expected a positive offset, got ${first.offset}`);

      // And it accumulates rather than resetting each time.
      await runAndRate(5);
      const second = await focusRepo.findCalibration(learner);
      assert.ok(
        second.offset > first.offset,
        `expected the offset to keep climbing: ${first.offset} -> ${second.offset}`,
      );
      assert.ok(second.offset <= 25, "the offset must stay inside its ceiling");

      // And it reaches the score the user is actually shown.
      const accuracy = await focusService.getAccuracy(learner);
      assert.equal(accuracy.calibrationOffset, second.offset);
    } finally {
      await destroyUser(learner);
    }
  });

  it("ranks the leaderboard by weighted minutes and hides blocked users", async () => {
    const rival = await makeUser("rival");
    try {
      const run = async (owner, minutes) => {
        const id = await openSession(owner, { minutes });
        await focusService.ingestSamples(id, owner, [
          { motionVariance: 0.05, inApp: true },
          { motionVariance: 0.05, inApp: true },
        ]);
        await sessionService.endSession(id, owner);
      };
      await run(rival, 90);

      const visible = await focusService.getLeaderboard(userId, { days: 7, limit: 50 });
      assert.ok(
        visible.entries.some((e) => e.userId === rival),
        "rival should appear before being blocked",
      );
      assert.ok(visible.me.weightedMinutes > 0, "caller's own total should be reported");

      await prisma.block.create({ data: { blockerId: userId, blockedId: rival } });
      const hidden = await focusService.getLeaderboard(userId, { days: 7, limit: 50 });
      assert.ok(
        !hidden.entries.some((e) => e.userId === rival),
        "a blocked user must not appear on a social surface",
      );
    } finally {
      await destroyUser(rival);
    }
  });
});
