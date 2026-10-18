import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Integration tests for deleting an account: real Prisma, real Postgres, no
 * mocks. Skipped unless TEST_DATABASE_URL is set - see the note at the top of
 * focus.integration.test.js, which this file follows.
 *
 * Over HTTP throughout, because the parts most worth testing sit in front of
 * the service: the body a delete demands, the order requireSelf and the
 * password check run in, and the status a wrong password gets.
 *
 * Photo- and Stripe-free: neither R2 nor Stripe is reached from these tests,
 * and an account with no avatar, no uploads and no subscription calls neither.
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : "TEST_DATABASE_URL not set";

const PASSWORD = "correct-horse-battery";

let prisma, userService, sessionService, groupService, postService;
let commentService, routineService, closeRedis, closeRabbitMq;
let app, signAccessToken;
const userIds = [];

if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.DIRECT_URL = TEST_DB;
  ({ prisma, closeRedis, closeRabbitMq } = await import("@stdyapp/core"));
  userService = await import("../../src/services/user.service.js");
  sessionService = await import("../../src/services/session.service.js");
  groupService = await import("../../src/services/studyGroup.service.js");
  postService = await import("../../src/services/post.service.js");
  commentService = await import("../../src/services/comment.service.js");
  routineService = await import("../../src/services/studyRoutine.service.js");
  ({ default: app } = await import("../../src/app.js"));
  ({ signAccessToken } = await import("../../src/services/token.service.js"));
}

const withServer = async (run) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const makeUser = async (suffix) => {
  const user = await prisma.user.create({
    data: {
      email: `delete-${suffix}-${randomUUID()}@test.local`,
      username: `del_${suffix}_${randomUUID().slice(0, 8)}`,
      passwordHash: await userService.hashPassword(PASSWORD),
    },
    select: { id: true, username: true },
  });
  userIds.push(user.id);
  return user;
};

const finishedSession = async (userId, groupId) => {
  const session = await sessionService.startSession({ userId, groupId });
  return sessionService.endSession(session.id, userId);
};

/** DELETE /api/users/:id as `asUser`, with `body` as JSON when given. */
const deleteRequest = (base, targetId, asUser, body) =>
  fetch(`${base}/api/users/${targetId}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${signAccessToken(asUser)}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("deleting an account against a real database", { skip }, () => {
  let owner, member, bystander, group, ownPost, memberSession, ownComment;

  before(async () => {
    owner = await makeUser("owner");
    member = await makeUser("member");
    bystander = await makeUser("bystander");

    // A group the owner runs, with a member who studied in it.
    group = await groupService.createGroup({
      ownerId: owner.id,
      name: `Disband ${randomUUID().slice(0, 6)}`,
    });
    await groupService.joinGroupByCode(member.id, group.joinCode);
    memberSession = await finishedSession(member.id, group.id);

    // The owner's own history: a group session, a post about it that someone
    // else commented on, a comment of theirs on someone else's post, a routine
    // and a follow.
    const ownSession = await finishedSession(owner.id, group.id);
    ownPost = await postService.createPost({
      userId: owner.id,
      sessionId: ownSession.id,
      title: "about to vanish",
    });
    await commentService.createComment({ userId: member.id, postId: ownPost.id, body: "nice" });

    const memberPost = await postService.createPost({
      userId: member.id,
      title: "stays",
      caption: "the member's own",
    });
    ownComment = await commentService.createComment({
      userId: owner.id,
      postId: memberPost.id,
      body: "goes with the account",
    });

    await routineService.createRoutine({ userId: owner.id, title: "Mornings" });
    await prisma.follow.create({ data: { followerId: owner.id, followingId: member.id } });
  });

  after(async () => {
    try {
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.comment.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.post.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.studyGroup.deleteMany({ where: { ownerId: { in: userIds } } });
      await prisma.groupMembership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.studyRoutine.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.follow.deleteMany({
        where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await Promise.allSettled([prisma.$disconnect(), closeRedis(), closeRabbitMq()]);
    }
  });

  const ownerStillThere = async () =>
    Boolean(await prisma.user.findUnique({ where: { id: owner.id } }));

  const disbandedNotices = () =>
    prisma.notification.findMany({
      where: { userId: member.id, type: "GROUP_DISBANDED" },
    });

  it("refuses a delete with no proof", async () => {
    await withServer(async (base) => {
      assert.equal((await deleteRequest(base, owner.id, owner)).status, 400);
      assert.equal((await deleteRequest(base, owner.id, owner, {})).status, 400);
    });
    assert.equal(await ownerStillThere(), true);
  });

  it("refuses a wrong password with a 403, not a 401, and deletes nothing", async () => {
    await withServer(async (base) => {
      const res = await deleteRequest(base, owner.id, owner, { password: "not it" });
      // 403: a 401 would make the app refresh its token and send this again.
      assert.equal(res.status, 403);
    });
    assert.equal(await ownerStillThere(), true);
    assert.ok(await prisma.post.findUnique({ where: { id: ownPost.id } }));
    assert.ok(await prisma.studyGroup.findUnique({ where: { id: group.id } }));
    assert.equal((await disbandedNotices()).length, 0);
  });

  it("refuses someone else's account, even with that account's password", async () => {
    await withServer(async (base) => {
      const res = await deleteRequest(base, owner.id, bystander, { password: PASSWORD });
      assert.equal(res.status, 403);
    });
    assert.equal(await ownerStillThere(), true);
  });

  it("refuses a Google proof when no Google account is linked", async () => {
    await withServer(async (base) => {
      const res = await deleteRequest(base, owner.id, owner, { googleIdToken: "not.a.token" });
      // 403 when Google is configured, 503 when it is not - never a delete.
      assert.ok([403, 503].includes(res.status), `got ${res.status}`);
    });
    assert.equal(await ownerStillThere(), true);
  });

  it("says whether Google is linked on /me", async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/auth/me`, {
        headers: { authorization: `Bearer ${signAccessToken(owner)}` },
      });
      assert.equal(res.status, 200);
      const { data } = await res.json();
      assert.equal(data.hasGoogle, false);
    });
  });

  it("deletes the account and everything in it with the right password", async () => {
    await withServer(async (base) => {
      const res = await deleteRequest(base, owner.id, owner, { password: PASSWORD });
      assert.equal(res.status, 204);

      // The old access token is dead on the very next request.
      const me = await fetch(`${base}/api/auth/me`, {
        headers: { authorization: `Bearer ${signAccessToken(owner)}` },
      });
      assert.equal(me.status, 401);
    });

    assert.equal(await ownerStillThere(), false);
    const where = { userId: owner.id };
    assert.equal(await prisma.session.count({ where }), 0);
    assert.equal(await prisma.post.count({ where }), 0);
    assert.equal(await prisma.comment.count({ where }), 0);
    assert.equal(await prisma.studyRoutine.count({ where }), 0);
    assert.equal(await prisma.groupMembership.count({ where }), 0);
    assert.equal(await prisma.notification.count({ where }), 0);
    assert.equal(await prisma.refreshToken.count({ where }), 0);
    assert.equal(await prisma.follow.count({ where: { followerId: owner.id } }), 0);
    assert.equal(await prisma.studyGroup.findUnique({ where: { id: group.id } }), null);
    assert.equal(await prisma.comment.findUnique({ where: { id: ownComment.id } }), null);

    // Other people keep their own history, just no longer in the group.
    const survivor = await prisma.session.findUnique({ where: { id: memberSession.id } });
    assert.ok(survivor);
    assert.equal(survivor.groupId, null);
    assert.equal(await prisma.groupMembership.count({ where: { userId: member.id } }), 0);
  });

  it("tells the group's other members it was disbanded, once each", async () => {
    const notices = await disbandedNotices();
    assert.equal(notices.length, 1);
    assert.ok(notices[0].message.includes(group.name));
    assert.equal(notices[0].actorId, null);

    const toBystander = await prisma.notification.count({
      where: { userId: bystander.id, type: "GROUP_DISBANDED" },
    });
    assert.equal(toBystander, 0);
  });
});
