import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Integration tests for how sessions END when things go wrong: real Prisma,
 * real Postgres, no mocks. Skipped unless TEST_DATABASE_URL is set - see the
 * note at the top of focus.integration.test.js, which this file follows.
 *
 * Covers crediting an abandoned session to the day it started, ending at the
 * moment End was tapped after a retry, and the background sweep - including
 * that only foreground samples count as signs of life, so every phone is
 * judged alike.
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : "TEST_DATABASE_URL not set";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

let prisma, sessionService, closeRedis, closeRabbitMq;
const userIds = [];

if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.DIRECT_URL = TEST_DB;
  ({ prisma, closeRedis, closeRabbitMq } = await import("@stdyapp/core"));
  sessionService = await import("../../src/services/session.service.js");
}

/** A fresh user per test, so streaks and open sessions never leak between them. */
const makeUser = async () => {
  const user = await prisma.user.create({
    data: {
      email: `life-${randomUUID()}@test.local`,
      username: `life_${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
    },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
};

/** An open session written directly - no service path backdates startedAt. */
const openSession = (userId, startedAt, plannedMinutes = null) =>
  prisma.session.create({ data: { userId, startedAt, plannedMinutes } });

const sample = (sessionId, timestamp, inApp = true) =>
  prisma.focusSample.create({
    data: { sessionId, timestamp, motionVariance: 0, inApp, computedFocus: 0.7 },
  });

const ago = (ms) => new Date(Date.now() - ms);

/** The UTC calendar day of a moment, as the streaks table stores it. */
const utcDay = (date) => date.toISOString().slice(0, 10);

describe("ending sessions when things go wrong", { skip }, () => {
  after(async () => {
    try {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      // Streaks and notifications cascade with their user.
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await Promise.allSettled([prisma.$disconnect(), closeRedis(), closeRabbitMq()]);
    }
  });

  // ---- 9: abandoned sessions count towards streaks, on the day they began ----

  it("credits an abandoned session's streak day to the day it started", async () => {
    const userId = await makeUser();
    const yesterday = ago(24 * HOUR);
    const left = await openSession(userId, yesterday);
    await sample(left.id, new Date(yesterday.getTime() + 20 * MINUTE));

    await sessionService.abandonSession(left.id, userId);

    const streak = await prisma.streak.findUnique({ where: { userId } });
    assert.equal(streak.currentCount, 1);
    assert.equal(utcDay(streak.lastActiveDate), utcDay(yesterday));

    // Studying today continues it rather than restarting it.
    const today = await sessionService.startSession({ userId });
    await sessionService.endSession(today.id, userId);
    const after = await prisma.streak.findUnique({ where: { userId } });
    assert.equal(after.currentCount, 2);
  });

  it("never resets a streak for a session closed after a later day was counted", async () => {
    const userId = await makeUser();
    const today = await sessionService.startSession({ userId });
    await sessionService.endSession(today.id, userId);

    // A session from three days ago, closed only now.
    const old = await openSession(userId, ago(72 * HOUR));
    await sessionService.abandonSession(old.id, userId);

    const streak = await prisma.streak.findUnique({ where: { userId } });
    assert.equal(streak.currentCount, 1);
    assert.equal(utcDay(streak.lastActiveDate), utcDay(new Date()));
  });

  // ---- 5: a retried End ends at the tap, not at the retry ----

  it("ends at the moment End was tapped, clamped to the session's own span", async () => {
    const userId = await makeUser();

    const a = await openSession(userId, ago(30 * MINUTE));
    const tapped = ago(10 * MINUTE);
    const ended = await sessionService.endSession(a.id, userId, { endedAt: tapped });
    assert.equal(ended.endedAt.getTime(), tapped.getTime());
    assert.equal(ended.focusPoints, 20);

    // A tap "in the future" is clamped to now: a client can never add time.
    const b = await openSession(userId, ago(30 * MINUTE));
    const future = await sessionService.endSession(b.id, userId, {
      endedAt: new Date(Date.now() + HOUR),
    });
    assert.ok(future.endedAt.getTime() <= Date.now());

    // A tap before the start is clamped to the start.
    const c = await openSession(userId, ago(30 * MINUTE));
    const early = await sessionService.endSession(c.id, userId, { endedAt: ago(2 * HOUR) });
    assert.equal(early.endedAt.getTime(), c.startedAt.getTime());
  });

  // ---- 6: the sweep ----

  it("sweeps a planned session long past its end, at its last sign of life", async () => {
    const userId = await makeUser();
    const started = ago(3 * HOUR);
    const s = await openSession(userId, started, 30);
    const last = new Date(started.getTime() + 25 * MINUTE);
    await sample(s.id, last);

    await sessionService.sweepAbandonedSessions({ userIds: [userId] });

    const row = await prisma.session.findUnique({ where: { id: s.id } });
    assert.equal(row.endedAt.getTime(), last.getTime());
    assert.equal(row.focusPoints, 25);
  });

  it("leaves a planned session alone while it is still within its plan", async () => {
    const userId = await makeUser();
    // A 4-hour plan, silent for 2 hours - a locked phone, perhaps.
    const s = await openSession(userId, ago(2 * HOUR), 240);

    await sessionService.sweepAbandonedSessions({ userIds: [userId] });

    const row = await prisma.session.findUnique({ where: { id: s.id } });
    assert.equal(row.endedAt, null);
  });

  it("gives an open-ended session three silent hours before sweeping it", async () => {
    const userId = await makeUser();
    const twoHours = await openSession(userId, ago(2 * HOUR));
    const fourHours = await openSession(userId, ago(4 * HOUR));

    await sessionService.sweepAbandonedSessions({ userIds: [userId] });

    assert.equal((await prisma.session.findUnique({ where: { id: twoHours.id } })).endedAt, null);
    assert.ok((await prisma.session.findUnique({ where: { id: fourHours.id } })).endedAt);
  });

  it("judges every phone alike: background samples are not signs of life", async () => {
    const userId = await makeUser();
    // What an Android phone can do after the app is put away: keep sampling,
    // marked as not in the app. An iPhone in the same moment sends nothing.
    const started = ago(4 * HOUR);
    const s = await openSession(userId, started);
    await sample(s.id, new Date(started.getTime() + 10 * MINUTE), true);
    await sample(s.id, ago(2 * MINUTE), false);

    // The sweep treats it as silent since its last FOREGROUND sample...
    await sessionService.sweepAbandonedSessions({ userIds: [userId] });
    const row = await prisma.session.findUnique({ where: { id: s.id } });
    assert.equal(row.endedAt.getTime(), started.getTime() + 10 * MINUTE);
  });

  it("applies the same rule when starting: a background-only session does not block", async () => {
    const userId = await makeUser();
    const left = await openSession(userId, ago(30 * MINUTE));
    await sample(left.id, ago(1 * MINUTE), false);

    // Silent in the foreground for 30 minutes, so it is closed rather than
    // treated as running on another device.
    const fresh = await sessionService.startSession({ userId });
    assert.ok((await prisma.session.findUnique({ where: { id: left.id } })).endedAt);
    await sessionService.endSession(fresh.id, userId);
  });
});
