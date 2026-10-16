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

    // Every group has a code from the start, public ones included - it is how
    // anyone joins - and going private or public leaves it where it was.
    assert.match(flip.joinCode, /^[A-HJ-NP-Z2-9]{6}$/);
    const privateNow = await groupService.updateGroup(flip.id, hostId, { isPrivate: true });
    assert.equal(privateNow.joinCode, flip.joinCode);

    const reset = await groupService.regenerateJoinCode(flip.id, hostId);
    assert.notEqual(reset.joinCode, privateNow.joinCode);
    await rejectsWith(groupService.regenerateJoinCode(flip.id, memberId), 403);

    // The new code works - typed in lower case - and the old one no longer does.
    await rejectsWith(groupService.joinGroup(flip.id, memberId, privateNow.joinCode), 403);
    await groupService.joinGroup(flip.id, memberId, reset.joinCode.toLowerCase());

    const publicAgain = await groupService.updateGroup(flip.id, hostId, { isPrivate: false });
    assert.equal(publicAgain.joinCode, reset.joinCode);
    // A public group's code can be replaced too, now that it has one.
    const publicReset = await groupService.regenerateJoinCode(flip.id, hostId);
    assert.notEqual(publicReset.joinCode, reset.joinCode);
  });

  it("joins any group by its code alone, and shows the code only to members", async () => {
    const joinerId = await makeUser("coder");
    try {
      const hidden = await groupService.createGroup({
        ownerId: hostId,
        name: `Coded ${randomUUID().slice(0, 6)}`,
        isPrivate: true,
      });

      // An outsider sees the group but not its code - the code is the key.
      const before = await groupService.getGroup(hidden.id, joinerId);
      assert.equal(before.isMember, false);
      assert.equal("joinCode" in before, false);

      // Wrong codes say so without giving anything away.
      await assert.rejects(groupService.joinGroupByCode(joinerId, "ZZZZZZ"), (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.data, undefined, "an unknown code points nowhere");
        return true;
      });

      // A live group SESSION's code, typed into the same boxes, is pointed at.
      const live = await sessionService.startSession({ userId: hostId, groupId: hidden.id });
      assert.match(live.inviteCode, /^[A-HJ-NP-Z2-9]{6}$/, "session codes skip I, O, 0 and 1 too");
      await assert.rejects(
        groupService.joinGroupByCode(joinerId, live.inviteCode.toLowerCase()),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.data?.sessionCode, live.inviteCode);
          assert.equal(err.data?.groupName, hidden.name);
          return true;
        },
      );
      await sessionService.endSession(live.id, hostId);
      // Once it has ended, it is just an unknown code.
      await assert.rejects(groupService.joinGroupByCode(joinerId, live.inviteCode), (err) => {
        assert.equal(err.data, undefined);
        return true;
      });

      // Typed the way people type a code read out to them.
      const spaced = `${hidden.joinCode.slice(0, 3)}-${hidden.joinCode.slice(3).toLowerCase()}`;
      const joined = await groupService.joinGroupByCode(joinerId, spaced);
      assert.equal(joined.id, hidden.id);
      assert.equal(joined.isMember, true);
      assert.equal(joined.joinCode, hidden.joinCode, "a member is shown the code to share");

      // A second time is a short trip to the group, not a second membership.
      await assert.rejects(groupService.joinGroupByCode(joinerId, hidden.joinCode), (err) => {
        assert.equal(err.status, 409);
        assert.equal(err.data?.groupId, hidden.id);
        return true;
      });
      const members = await groupService.listMembers(hidden.id);
      assert.equal(members.filter((m) => m.userId === joinerId).length, 1);

      // Every member can see the code - not only the owner, as it used to be.
      const asMember = await groupService.getGroup(hidden.id, joinerId);
      assert.equal(asMember.joinCode, hidden.joinCode);
      const searched = await groupService.searchGroups(
        { q: hidden.name, page: 1, limit: 5 },
        memberId,
      );
      const asStranger = searched.items.find((g) => g.id === hidden.id);
      assert.ok(asStranger, "a private group is still found by search");
      assert.equal("joinCode" in asStranger, false, "but its code is not in the result");
    } finally {
      await destroyUsers([joinerId]);
    }
  });

  it("allows one running session per person, for starting as well as joining", async () => {
    const first = await sessionService.startSession({ userId: memberId });
    await rejectsWith(sessionService.startSession({ userId: memberId }), 409);
    await sessionService.endSession(first.id, memberId);

    // Ended, so the next start goes through.
    const second = await sessionService.startSession({ userId: memberId });
    await sessionService.endSession(second.id, memberId);
  });

  it("abandons a session at its last sign of life, once, and only for its owner", async () => {
    const startedAt = new Date(Date.now() - 30 * 60 * 1000);
    const lastSample = new Date(Date.now() - 20 * 60 * 1000);
    const left = await prisma.session.create({ data: { userId: memberId, startedAt } });
    await prisma.focusSample.create({
      data: {
        sessionId: left.id,
        timestamp: lastSample,
        motionVariance: 0,
        inApp: true,
        computedFocus: 0.7,
      },
    });

    await rejectsWith(sessionService.abandonSession(left.id, hostId), 403);

    const closed = await sessionService.abandonSession(left.id, memberId);
    assert.equal(closed.endedAt.getTime(), lastSample.getTime());
    assert.equal(closed.focusPoints, 10);

    // A retry answers with the same closed session rather than failing.
    const again = await sessionService.abandonSession(left.id, memberId);
    assert.equal(again.endedAt.getTime(), lastSample.getTime());
  });

  it("names the group on each row of the caller's history", async () => {
    const history = await sessionService.listMySessions(memberId);
    const grouped = history.filter((s) => s.groupId === group.id);
    assert.ok(grouped.length > 0);
    assert.ok(grouped.every((s) => s.group?.name === group.name));
    // A solo session carries no group rather than a broken one.
    assert.ok(history.filter((s) => !s.groupId).every((s) => s.group === null));
  });

  it("shows which members are studying in ANY session, to members only", async () => {
    // Its own stranger: `outsiderId` joined this public group earlier, by
    // joining one of its sessions.
    const strangerId = await makeUser("stranger");

    // Earlier tests leave sessions open; start from nobody studying.
    await prisma.session.updateMany({
      where: { userId: { in: [hostId, memberId, outsiderId] }, endedAt: null },
      data: { endedAt: new Date() },
    });
    assert.deepEqual(await groupService.listStudyingMembers(group.id, hostId), []);

    // A SOLO session - no group at all - still counts: the strip is about
    // the group's people, not its rooms.
    const solo = await sessionService.startSession({ userId: memberId });
    // A stranger studying is nobody this group sees.
    const strangerSession = await sessionService.startSession({ userId: strangerId });

    const asHost = await groupService.listStudyingMembers(group.id, hostId);
    assert.deepEqual(
      asHost.map((row) => row.userId),
      [memberId],
      "only the member studying, and nobody from outside the group",
    );
    assert.equal(asHost[0].studyingHere, false, "a solo session is not studying here");
    assert.equal(asHost[0].isMine, false);

    // The viewer's own session leads the strip, flagged as theirs.
    const hosted = await sessionService.startSession({ userId: hostId, groupId: group.id });
    const asMember = await groupService.listStudyingMembers(group.id, memberId);
    assert.equal(asMember[0].userId, memberId);
    assert.equal(asMember[0].isMine, true);
    assert.equal(asMember.find((row) => row.userId === hostId)?.studyingHere, true);

    await rejectsWith(groupService.listStudyingMembers(group.id, strangerId), 403);

    // A block hides someone here as everywhere else, in either direction.
    await prisma.block.create({ data: { blockerId: memberId, blockedId: hostId } });
    try {
      const blockedView = await groupService.listStudyingMembers(group.id, hostId);
      assert.equal(blockedView.some((row) => row.userId === memberId), false);
    } finally {
      await prisma.block.deleteMany({ where: { blockerId: memberId } });
    }

    // Ending a session takes them off it.
    await sessionService.endSession(solo.id, memberId);
    const after = await groupService.listStudyingMembers(group.id, hostId);
    assert.equal(after.some((row) => row.userId === memberId), false);

    await sessionService.endSession(hosted.id, hostId);
    await sessionService.endSession(strangerSession.id, strangerId);
    await destroyUsers([strangerId]);
  });
});
