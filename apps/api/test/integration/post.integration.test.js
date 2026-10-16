import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Integration tests for posts: real Prisma, real Postgres, no mocks. Skipped
 * unless TEST_DATABASE_URL is set - see the note at the top of
 * focus.integration.test.js, which this file follows.
 *
 * Photo-free on purpose: photos are verified against R2, which these tests do
 * not reach. Everything here is about what a post must carry and who sees it.
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : "TEST_DATABASE_URL not set";

let prisma, postService, sessionService, closeRedis, closeRabbitMq;
const userIds = [];

if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.DIRECT_URL = TEST_DB;
  ({ prisma, closeRedis, closeRabbitMq } = await import("@stdyapp/core"));
  postService = await import("../../src/services/post.service.js");
  sessionService = await import("../../src/services/session.service.js");
}

const makeUser = async (suffix) => {
  const user = await prisma.user.create({
    data: {
      email: `post-${suffix}-${randomUUID()}@test.local`,
      username: `post_${suffix}_${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
    },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
};

/** A finished session of the user's own, for a post to be about. */
const finishedSession = async (userId) => {
  const session = await sessionService.startSession({ userId });
  return sessionService.endSession(session.id, userId);
};

const rejectsWith = (promise, status) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    return true;
  });

describe("posts against a real database", { skip }, () => {
  let authorId;

  before(async () => {
    authorId = await makeUser("author");
  });

  after(async () => {
    try {
      await prisma.post.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.studyGroup.deleteMany({ where: { ownerId: { in: userIds } } });
      await prisma.groupMembership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.follow.deleteMany({
        where: { OR: [{ followerId: { in: userIds } }, { followingId: { in: userIds } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await Promise.allSettled([prisma.$disconnect(), closeRedis(), closeRabbitMq()]);
    }
  });

  it("takes a title alone for a post about a session", async () => {
    const session = await finishedSession(authorId);
    const post = await postService.createPost({
      userId: authorId,
      sessionId: session.id,
      title: "Morning study session",
    });
    assert.equal(post.title, "Morning study session");
    assert.equal(post.caption, null);
  });

  it("still needs a photo or a caption for a post with no session", async () => {
    await rejectsWith(postService.createPost({ userId: authorId, title: "Just words" }), 400);
    const post = await postService.createPost({
      userId: authorId,
      title: "Just words",
      caption: "with a caption, it is a post",
    });
    assert.ok(post.id);
  });

  it("refuses an edit that would leave a post with nothing to show", async () => {
    const session = await finishedSession(authorId);
    const post = await postService.createPost({
      userId: authorId,
      sessionId: session.id,
      title: "Title only",
    });

    // Unlinking its session would leave a bare title.
    await rejectsWith(postService.updatePost(post.id, authorId, { sessionId: null }), 400);
    // Clearing a caption it never had is fine: the session still carries it.
    await postService.updatePost(post.id, authorId, { caption: null });

    const worded = await postService.createPost({
      userId: authorId,
      title: "Words",
      caption: "the only thing here",
    });
    await rejectsWith(postService.updatePost(worded.id, authorId, { caption: null }), 400);
  });
});
