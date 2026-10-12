import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Integration tests for studying together: real Prisma, real Postgres, no
 * mocks. Skipped unless TEST_DATABASE_URL is set - see the note at the top of
 * focus.integration.test.js, which this file follows.
 *
 * Covers joining a running group session by invite code, rooms, joining a
 * public group on the way in, closing sessions an app crash left open, the
 * group's "studying now" list, and the viewer fields on group reads.
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : "TEST_DATABASE_URL not set";

let prisma, sessionService, groupService, bus, closeRedis, closeRabbitMq;
let hostId, memberId, outsiderId;
let group;

if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.DIRECT_URL = TEST_DB;
  ({ prisma, closeRedis, closeRabbitMq } = await import("@stdyapp/core"));
  sessionService = await import("../../src/services/session.service.js");
  groupService = await import("../../src/services/studyGroup.service.js");
  bus = await import("../../src/realtime/notificationBus.js");
}

/**
 * Sessions and memberships first: both reference users with RESTRICT. Owned
 * groups go before the memberships, and take their own memberships with them.
 */
const destroyUsers = async (ids) => {
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.studyGroup.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.groupMembership.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
};

const makeUser = async (suffix) => {
  const user = await prisma.user.create({
    data: {
      email: `group-${suffix}-${randomUUID()}@test.local`,
      username: `group_${suffix}_${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
    },
    select: { id: true },
  });
  return user.id;
};

/** Asserts a promise rejects with an HTTP-style status. */
const rejectsWith = (promise, status) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    return true;
  });

describe("group sessions against a real database", { skip }, () => {
  before(async () => {
    hostId = await makeUser("host");
    memberId = await makeUser("member");
    outsiderId = await makeUser("outsider");

    group = await groupService.createGroup({
      ownerId: hostId,
      name: `Study crew ${randomUUID().slice(0, 6)}`,
      isPrivate: false,
    });
    await groupService.joinGroup(group.id, memberId);
  });

  after(async () => {
    try {
      await destroyUsers([hostId, memberId, outsiderId]);
    } finally {
      await Promise.allSettled([prisma.$disconnect(), closeRedis(), closeRabbitMq()]);
    }
  });

  it("tells each viewer where they stand in a group", async () => {
    const asHost = await groupService.getGroup(group.id, hostId);
    assert.equal(asHost.isMember, true);
    assert.equal(asHost.isOwner, true);

    const asMember = await groupService.getGroup(group.id, memberId);
    assert.equal(asMember.isMember, true);
    assert.equal(asMember.isOwner, false);
    assert.equal(asMember.role, "MEMBER");

    const asOutsider = await groupService.getGroup(group.id, outsiderId);
    assert.equal(asOutsider.isMember, false);
    assert.equal(asOutsider.role, null);
    assert.equal("memberships" in asOutsider, false);
  });

  it("lists only the viewer's own groups as theirs", async () => {
    const mine = await groupService.listMyGroups(memberId);
    assert.ok(mine.some((g) => g.id === group.id));
    assert.ok(mine.every((g) => g.isMember));

    const outsiders = await groupService.listMyGroups(outsiderId);
    assert.equal(outsiders.some((g) => g.id === group.id), false);
  });

  it("joins a running group session, inheriting the host's remaining plan", async () => {
    const host = await sessionService.startSession({
      userId: hostId,
      groupId: group.id,
      plannedMinutes: 50,
    });
    assert.ok(host.inviteCode);

    // Members see it live, flagged for whoever owns it.
    const live = await groupService.listLiveSessions(group.id, memberId);
    const hostRow = live.find((s) => s.id === host.id);
    assert.ok(hostRow, "the host's session should be live");
    assert.equal(hostRow.isMine, false);
    assert.equal(hostRow.inviteCode, host.inviteCode);

    const joined = await sessionService.joinSession({
      userId: memberId,
      inviteCode: host.inviteCode,
    });
    assert.equal(joined.userId, memberId);
    assert.equal(joined.groupId, group.id);
    assert.notEqual(joined.id, host.id);
    // Started moments ago, so all 50 minutes are still to go.
    assert.equal(joined.plannedMinutes, 50);

    const afterJoin = await groupService.listLiveSessions(group.id, memberId);
    assert.equal(afterJoin.find((s) => s.id === joined.id)?.isMine, true);

    // A second join while the first is still running would double count.
    await rejectsWith(
      sessionService.joinSession({ userId: memberId, inviteCode: host.inviteCode }),
      409,
    );

    await sessionService.endSession(joined.id, memberId);
    await sessionService.endSession(host.id, hostId);

    const afterEnd = await groupService.listLiveSessions(group.id, memberId);
    assert.equal(afterEnd.some((s) => s.id === host.id || s.id === joined.id), false);
  });

  it("refuses an ended session, your own session and unknown codes", async () => {
    const host = await sessionService.startSession({ userId: hostId, groupId: group.id });

    await rejectsWith(
      sessionService.joinSession({ userId: hostId, inviteCode: host.inviteCode }),
      409,
    );
    await rejectsWith(groupService.listLiveSessions(group.id, outsiderId), 403);
    await rejectsWith(
      sessionService.joinSession({ userId: memberId, inviteCode: "NOSUCHCODE" }),
      404,
    );

    await sessionService.endSession(host.id, hostId);
    await rejectsWith(
      sessionService.joinSession({ userId: memberId, inviteCode: host.inviteCode }),
      409,
    );
  });

  it("puts everyone who joins in the host's room, whichever code they used", async () => {
    const host = await sessionService.startSession({ userId: hostId, groupId: group.id });
    const first = await sessionService.joinSession({
      userId: memberId,
      inviteCode: host.inviteCode,
    });
    assert.equal(first.hostSessionId, host.id);

    // Joining through a PARTICIPANT's code still lands in the host's room.
    const second = await sessionService.joinSession({
      userId: outsiderId,
      inviteCode: first.inviteCode,
    });
    assert.equal(second.hostSessionId, host.id);

    const live = await groupService.listLiveSessions(group.id, hostId);
    assert.equal(live.find((s) => s.id === first.id)?.hostSessionId, host.id);
    assert.equal(live.find((s) => s.id === host.id)?.hostSessionId, null);

    await sessionService.endSession(first.id, memberId);
    await sessionService.endSession(second.id, outsiderId);

    // Deleting the host's session costs the others the link, not their rows.
    await sessionService.endSession(host.id, hostId);
    await sessionService.deleteSession(host.id, hostId);
    const orphan = await prisma.session.findUnique({ where: { id: first.id } });
    assert.equal(orphan.hostSessionId, null);
  });

  it("joins a PUBLIC group on the way into one of its sessions", async () => {
    const newcomerId = await makeUser("newcomer");
    try {
      const host = await sessionService.startSession({ userId: hostId, groupId: group.id });
      const joined = await sessionService.joinSession({
        userId: newcomerId,
        inviteCode: host.inviteCode,
      });
      assert.equal(joined.groupId, group.id);
      assert.equal((await groupService.getGroup(group.id, newcomerId)).isMember, true);

      await sessionService.endSession(joined.id, newcomerId);
      await sessionService.endSession(host.id, hostId);
    } finally {
      await destroyUsers([newcomerId]);
    }
  });

  it("sends a non-member of a PRIVATE group to its join code instead", async () => {
    const hidden = await groupService.createGroup({
      ownerId: hostId,
      name: `Hidden ${randomUUID().slice(0, 6)}`,
      isPrivate: true,
    });
    const host = await sessionService.startSession({ userId: hostId, groupId: hidden.id });

    await assert.rejects(
      sessionService.joinSession({ userId: memberId, inviteCode: host.inviteCode }),
      (err) => {
        assert.equal(err.status, 403);
        assert.equal(err.data?.groupId, hidden.id);
        return true;
      },
    );
    // Refused without being added - the invite code is never a key to the group.
    assert.equal((await groupService.getGroup(hidden.id, memberId)).isMember, false);

    await sessionService.endSession(host.id, hostId);
  });

  it("closes a session an app crash left open, at its last sign of life", async () => {
    // What a killed app leaves behind: no endedAt, and samples that stopped.
    const startedAt = new Date(Date.now() - 40 * 60 * 1000);
    const lastSample = new Date(Date.now() - 15 * 60 * 1000);
    const abandoned = await prisma.session.create({
      data: { userId: memberId, groupId: group.id, startedAt },
    });
    await prisma.focusSample.create({
      data: {
        sessionId: abandoned.id,
        timestamp: lastSample,
        motionVariance: 0,
        inApp: true,
        computedFocus: 0.8,
      },
    });

    const host = await sessionService.startSession({ userId: hostId, groupId: group.id });
    const joined = await sessionService.joinSession({
      userId: memberId,
      inviteCode: host.inviteCode,
    });
    assert.equal(joined.groupId, group.id);

    const closed = await prisma.session.findUnique({ where: { id: abandoned.id } });
    assert.equal(closed.endedAt.getTime(), lastSample.getTime());
    // 25 minutes of study, and nothing for the quarter hour after the crash.
    assert.equal(closed.focusPoints, 25);

    await sessionService.endSession(joined.id, memberId);
    await sessionService.endSession(host.id, hostId);
  });

  it("still refuses a join while another session is genuinely running", async () => {
    // Sampled a moment ago: alive, most likely on another device.
    const elsewhere = await sessionService.startSession({ userId: memberId });
    const host = await sessionService.startSession({ userId: hostId, groupId: group.id });

    await rejectsWith(
      sessionService.joinSession({ userId: memberId, inviteCode: host.inviteCode }),
      409,
    );
    const untouched = await prisma.session.findUnique({ where: { id: elsewhere.id } });
    assert.equal(untouched.endedAt, null);

    await sessionService.endSession(elsewhere.id, memberId);
    await sessionService.endSession(host.id, hostId);
  });

  it("shows who is still in a room, and tells them when it changes", async () => {
    const events = [];
    const stop = bus.subscribeNotificationEvents((userId, event) => {
      if (event.type === "room:updated") events.push({ userId, roomId: event.roomId });
    });
    // Give the subscriber connection a moment to SUBSCRIBE before publishing.
    await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      const host = await sessionService.startSession({ userId: hostId, groupId: group.id });
      const joined = await sessionService.joinSession({
        userId: memberId,
        inviteCode: host.inviteCode,
      });

      const room = await sessionService.getRoom(joined.id, memberId);
      assert.equal(room.roomId, host.id);
      assert.deepEqual(
        room.participants.map((p) => [p.user.id, p.isMine]),
        [
          [hostId, false],
          [memberId, true],
        ],
      );
      assert.ok(room.participants.every((p) => p.lastActiveAt instanceof Date));

      await sessionService.endSession(joined.id, memberId);
      await new Promise((resolve) => setTimeout(resolve, 300));

      // The host heard the join and the leave, both naming the room.
      const toHost = events.filter((e) => e.userId === hostId && e.roomId === host.id);
      assert.ok(toHost.length >= 2, `expected 2+ room events, got ${toHost.length}`);

      const after = await sessionService.getRoom(host.id, hostId);
      assert.deepEqual(after.participants.map((p) => p.user.id), [hostId]);

      // Only your own session's room is readable.
      await rejectsWith(sessionService.getRoom(host.id, memberId), 403);

      await sessionService.endSession(host.id, hostId);
    } finally {
      await stop();
    }
  });

  it("pages through group search", async () => {
    const tag = `pg${randomUUID().slice(0, 6)}`;
    for (const n of [1, 2, 3]) {
      await groupService.createGroup({ ownerId: hostId, name: `${tag} ${n}`, isPrivate: false });
    }

    const first = await groupService.searchGroups({ q: tag, page: 1, limit: 2 }, memberId);
    assert.equal(first.total, 3);
    assert.equal(first.items.length, 2);

    const second = await groupService.searchGroups({ q: tag, page: 2, limit: 2 }, memberId);
    assert.equal(second.items.length, 1);

    const ids = new Set([...first.items, ...second.items].map((g) => g.id));
    assert.equal(ids.size, 3, "no group should appear on two pages");
  });

  it("keeps a group joinable through privacy changes and code resets", async () => {
    const flip = await groupService.createGroup({
      ownerId: hostId,
      name: `Flip ${randomUUID().slice(0, 6)}`,
      isPrivate: false,
    });

    // Going private hands the group a code; without one nobody could join.
    const privateNow = await groupService.updateGroup(flip.id, hostId, { isPrivate: true });
    assert.match(privateNow.joinCode, /^[A-Z0-9]{4,16}$/);

    const reset = await groupService.regenerateJoinCode(flip.id, hostId);
    assert.notEqual(reset.joinCode, privateNow.joinCode);
    await rejectsWith(groupService.regenerateJoinCode(flip.id, memberId), 403);

    // The new code works; the old one no longer does.
    await rejectsWith(groupService.joinGroup(flip.id, memberId, privateNow.joinCode), 403);
    await groupService.joinGroup(flip.id, memberId, reset.joinCode);

    const publicAgain = await groupService.updateGroup(flip.id, hostId, { isPrivate: false });
    assert.equal(publicAgain.joinCode, null);
    await rejectsWith(groupService.regenerateJoinCode(flip.id, hostId), 409);
  });

  it("names the group on each row of the caller's history", async () => {
    const history = await sessionService.listMySessions(memberId);
    const grouped = history.filter((s) => s.groupId === group.id);
    assert.ok(grouped.length > 0);
    assert.ok(grouped.every((s) => s.group?.name === group.name));
    // A solo session carries no group rather than a broken one.
    assert.ok(history.filter((s) => !s.groupId).every((s) => s.group === null));
  });
});
