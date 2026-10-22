import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Integration tests for private accounts and follow requests: real Prisma, real
 * Postgres, over HTTP. Skipped unless TEST_DATABASE_URL is set - see the note
 * at the top of focus.integration.test.js, which this file follows.
 *
 * The cast:
 *   P - the private account
 *   S - a stranger, who asks to follow P
 *   F - an approved follower of P
 *   G - in a study group with P, but not following them
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : "TEST_DATABASE_URL not set";

let prisma, sessionService, groupService, postService, focusRepo;
let closeRedis, closeRabbitMq, app, signAccessToken;
const userIds = [];

if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.DIRECT_URL = TEST_DB;
  ({ prisma, closeRedis, closeRabbitMq } = await import("@stdyapp/core"));
  sessionService = await import("../../src/services/session.service.js");
  groupService = await import("../../src/services/studyGroup.service.js");
  postService = await import("../../src/services/post.service.js");
  focusRepo = await import("../../src/repositories/focus.repository.js");
  ({ default: app } = await import("../../src/app.js"));
  ({ signAccessToken } = await import("../../src/services/token.service.js"));
}

let base;
let server;

const makeUser = async (suffix, { isPrivate = false } = {}) => {
  const user = await prisma.user.create({
    data: {
      email: `privacy-${suffix}-${randomUUID()}@test.local`,
      username: `prv_${suffix}_${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
      isPrivate,
    },
    select: { id: true, username: true },
  });
  userIds.push(user.id);
  return user;
};

/** One request as `asUser`, answering { status, body }. */
const call = async (asUser, method, path, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${signAccessToken(asUser)}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const feedIds = async (asUser, query = "") => {
  const { body } = await call(asUser, "GET", `/api/posts/all?limit=50${query}`);
  return body.data.map((post) => post.id);
};

const notificationsOf = (userId, type) =>
  prisma.notification.findMany({ where: { userId, type } });

describe("private accounts against a real database", { skip }, () => {
  let P, S, F, G, group, followersPost, groupPost;

  before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}`;

    P = await makeUser("private", { isPrivate: true });
    S = await makeUser("stranger");
    F = await makeUser("follower");
    G = await makeUser("groupmate");

    await prisma.follow.create({ data: { followerId: F.id, followingId: P.id } });

    group = await groupService.createGroup({
      ownerId: P.id,
      name: `Privacy ${randomUUID().slice(0, 6)}`,
    });
    await groupService.joinGroupByCode(G.id, group.joinCode);

    const session = await sessionService.startSession({ userId: P.id });
    await sessionService.endSession(session.id, P.id);
    followersPost = await postService.createPost({
      userId: P.id,
      sessionId: session.id,
      title: "for followers",
    });
    groupPost = await postService.createPost({
      userId: P.id,
      title: "for the group",
      caption: "only here",
      shareToFollowers: false,
      groupIds: [group.id],
    });
  });

  after(async () => {
    try {
      await new Promise((resolve) => server.close(resolve));
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.followRequest.deleteMany({
        where: { OR: [{ requesterId: { in: userIds } }, { targetId: { in: userIds } }] },
      });
      await prisma.like.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.post.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.studyGroup.deleteMany({ where: { ownerId: { in: userIds } } });
      await prisma.groupMembership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.block.deleteMany({
        where: { OR: [{ blockerId: { in: userIds } }, { blockedId: { in: userIds } }] },
      });
      await prisma.follow.deleteMany({
        where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await Promise.allSettled([prisma.$disconnect(), closeRedis(), closeRabbitMq()]);
    }
  });

  describe("what a stranger sees", () => {
    it("keeps the profile header and counts open", async () => {
      assert.equal((await call(S, "GET", `/api/users/${P.id}`)).status, 200);
      const summary = await call(S, "GET", `/api/follows/user/${P.id}/count`);
      assert.equal(summary.status, 200);
      assert.equal(summary.body.canView, false);
      assert.equal(summary.body.followers, 1);
    });

    it("locks posts, streak and follower lists with a 403", async () => {
      for (const path of [
        `/api/posts/user/${P.id}`,
        `/api/streaks/user/${P.id}`,
        `/api/follows/user/${P.id}/followers`,
        `/api/follows/user/${P.id}/following`,
        `/api/likes/user/${P.id}`,
        `/api/comments/user/${P.id}`,
      ]) {
        const { status, body } = await call(S, "GET", path);
        assert.equal(status, 403, path);
        assert.equal(body.error, "This account is private");
      }
    });

    it("keeps their posts out of the feed", async () => {
      assert.equal((await feedIds(S)).includes(followersPost.id), false);
    });

    it("answers a hidden post as not found, for reads and writes", async () => {
      assert.equal((await call(S, "GET", `/api/comments/post/${followersPost.id}`)).status, 404);
      assert.equal((await call(S, "GET", `/api/likes/post/${followersPost.id}`)).status, 404);
      const like = await call(S, "POST", "/api/likes", { postId: followersPost.id });
      assert.equal(like.status, 404);
      const comment = await call(S, "POST", "/api/comments", {
        postId: followersPost.id,
        body: "hi",
      });
      assert.equal(comment.status, 404);
    });

    it("leaves them off the global leaderboard", async () => {
      assert.ok((await focusRepo.findHiddenPrivateUserIds(S.id)).includes(P.id));
      assert.equal((await focusRepo.findHiddenPrivateUserIds(F.id)).includes(P.id), false);
    });
  });

  describe("what an approved follower sees", () => {
    it("sees the posts, the lists and the feed entry", async () => {
      assert.equal((await call(F, "GET", `/api/posts/user/${P.id}`)).status, 200);
      assert.equal((await call(F, "GET", `/api/follows/user/${P.id}/followers`)).status, 200);
      assert.ok((await feedIds(F)).includes(followersPost.id));
      const summary = await call(F, "GET", `/api/follows/user/${P.id}/count`);
      assert.equal(summary.body.canView, true);
    });
  });

  describe("inside a shared group", () => {
    it("shows a group-mate the post shared to the group, but not the profile", async () => {
      assert.ok((await feedIds(G, `&audience=group&groupId=${group.id}`)).includes(groupPost.id));
      assert.equal((await call(G, "GET", `/api/posts/user/${P.id}`)).status, 403);
      assert.equal((await feedIds(G)).includes(followersPost.id), false);
    });
  });

  describe("follow requests", () => {
    it("turns a follow into a request, and tells the private account", async () => {
      const res = await call(S, "POST", "/api/follows", { followingId: P.id });
      assert.equal(res.status, 202);
      assert.equal(res.body.status, "requested");

      // Asking twice is one request.
      assert.equal((await call(S, "POST", "/api/follows", { followingId: P.id })).status, 202);
      assert.equal(
        await prisma.followRequest.count({ where: { requesterId: S.id, targetId: P.id } }),
        1,
      );

      const summary = await call(S, "GET", `/api/follows/user/${P.id}/count`);
      assert.equal(summary.body.requestedByMe, true);
      assert.equal(summary.body.followedByMe, false);

      const theirSide = await call(P, "GET", `/api/follows/user/${S.id}/count`);
      assert.equal(theirSide.body.requestsMe, true);

      await waitFor(async () => (await notificationsOf(P.id, "FOLLOW_REQUEST")).length === 1);
      const listed = await call(P, "GET", "/api/follows/requests");
      assert.deepEqual(listed.body.map((r) => r.requester.id), [S.id]);
    });

    it("accepting makes them a follower, withdraws the request and tells them", async () => {
      assert.equal((await call(P, "POST", `/api/follows/requests/${S.id}/accept`)).status, 204);

      assert.ok(await prisma.follow.findFirst({ where: { followerId: S.id, followingId: P.id } }));
      assert.equal(await prisma.followRequest.count({ where: { requesterId: S.id } }), 0);
      assert.equal((await notificationsOf(P.id, "FOLLOW_REQUEST")).length, 0);
      await waitFor(async () => (await notificationsOf(S.id, "FOLLOW_ACCEPTED")).length === 1);

      assert.equal((await call(S, "GET", `/api/posts/user/${P.id}`)).status, 200);
      assert.ok((await feedIds(S)).includes(followersPost.id));

      // Accepting again: there is nothing left to accept.
      assert.equal((await call(P, "POST", `/api/follows/requests/${S.id}/accept`)).status, 404);
    });

    it("declining leaves no follow and tells nobody", async () => {
      const asker = await makeUser("asker");
      await call(asker, "POST", "/api/follows", { followingId: P.id });
      await waitFor(async () =>
        (await notificationsOf(P.id, "FOLLOW_REQUEST")).some((n) => n.actorId === asker.id),
      );

      assert.equal((await call(P, "DELETE", `/api/follows/requests/${asker.id}`)).status, 204);
      assert.equal(await prisma.follow.count({ where: { followerId: asker.id } }), 0);
      assert.equal(await prisma.followRequest.count({ where: { requesterId: asker.id } }), 0);
      assert.equal(
        (await notificationsOf(P.id, "FOLLOW_REQUEST")).some((n) => n.actorId === asker.id),
        false,
      );
      assert.equal((await notificationsOf(asker.id, "FOLLOW_ACCEPTED")).length, 0);
    });

    it("the requester can cancel with the same tap as unfollowing", async () => {
      const asker = await makeUser("canceller");
      await call(asker, "POST", "/api/follows", { followingId: P.id });
      assert.equal((await call(asker, "DELETE", `/api/follows/user/${P.id}`)).status, 204);
      assert.equal(await prisma.followRequest.count({ where: { requesterId: asker.id } }), 0);
    });

    it("a block clears a pending request in either direction", async () => {
      const asker = await makeUser("blocked");
      await call(asker, "POST", "/api/follows", { followingId: P.id });
      assert.equal((await call(P, "POST", "/api/blocks", { blockedId: asker.id })).status, 201);
      assert.equal(await prisma.followRequest.count({ where: { requesterId: asker.id } }), 0);
    });
  });

  describe("going public", () => {
    it("accepts everyone who was waiting, and opens the profile to strangers", async () => {
      const waiting = await makeUser("waiting");
      const stranger = await makeUser("latecomer");
      await call(waiting, "POST", "/api/follows", { followingId: P.id });

      const res = await call(P, "PATCH", `/api/users/${P.id}`, { isPrivate: false });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.isPrivate, false);

      assert.ok(
        await prisma.follow.findFirst({ where: { followerId: waiting.id, followingId: P.id } }),
      );
      assert.equal(await prisma.followRequest.count({ where: { targetId: P.id } }), 0);
      assert.equal((await call(stranger, "GET", `/api/posts/user/${P.id}`)).status, 200);
      assert.ok((await feedIds(stranger)).includes(followersPost.id));

      // And a follow is instant again.
      const follow = await call(stranger, "POST", "/api/follows", { followingId: P.id });
      assert.equal(follow.status, 201);
      assert.equal(follow.body.status, "following");
    });
  });
});

/**
 * Notifications are raised fire-and-forget after the response, so a test reads
 * them back with a short poll rather than a fixed sleep.
 */
const waitFor = async (check, { timeoutMs = 3000, stepMs = 50 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  assert.fail("condition was not met in time");
};
