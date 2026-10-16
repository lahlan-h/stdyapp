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

let prisma, postService, sessionService, groupService, closeRedis, closeRabbitMq;
const userIds = [];

if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.DIRECT_URL = TEST_DB;
  ({ prisma, closeRedis, closeRabbitMq } = await import("@stdyapp/core"));
  postService = await import("../../src/services/post.service.js");
  sessionService = await import("../../src/services/session.service.js");
  groupService = await import("../../src/services/studyGroup.service.js");
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

  describe("sharing", () => {
    let friendId, strangerId, memberId, group;
    let toFollowers, toGroup, toBoth;
    const page = { page: 1, limit: 50, sort: "recent" };
    const ids = (result) => result.items.map((post) => post.id);

    before(async () => {
      friendId = await makeUser("friend");
      strangerId = await makeUser("stranger");
      memberId = await makeUser("member");
      // friend follows the author; the member is in the author's group.
      await prisma.follow.create({ data: { followerId: friendId, followingId: authorId } });
      group = await groupService.createGroup({ ownerId: authorId, name: `Share ${randomUUID().slice(0, 6)}` });
      await groupService.joinGroupByCode(memberId, group.joinCode);

      const post = async (title, share) => {
        const session = await finishedSession(authorId);
        return postService.createPost({ userId: authorId, sessionId: session.id, title, ...share });
      };
      toFollowers = await post("followers only", { shareToFollowers: true });
      toGroup = await post("group only", { shareToFollowers: false, groupIds: [group.id] });
      toBoth = await post("both", { shareToFollowers: true, groupIds: [group.id] });
    });

    it("refuses a post shared to nobody, and a group you are not in", async () => {
      const session = await finishedSession(authorId);
      await rejectsWith(
        postService.createPost({ userId: authorId, sessionId: session.id, title: "x", shareToFollowers: false }),
        400,
      );
      const theirs = await groupService.createGroup({ ownerId: strangerId, name: `Not mine ${randomUUID().slice(0, 6)}` });
      await rejectsWith(
        postService.createPost({ userId: authorId, sessionId: session.id, title: "x", groupIds: [theirs.id] }),
        403,
      );
    });

    it("puts only followers-shared posts in a follower's feed", async () => {
      const feed = ids(await postService.listAllPosts({ ...page, audience: "following" }, friendId));
      assert.ok(feed.includes(toFollowers.id));
      assert.ok(feed.includes(toBoth.id));
      assert.ok(!feed.includes(toGroup.id), "a group-only post is not in a follower's feed");
    });

    it("shows a group's feed only what was shared to it, to members only", async () => {
      const feed = ids(await postService.listAllPosts({ ...page, audience: "group", groupId: group.id }, memberId));
      assert.ok(feed.includes(toGroup.id));
      assert.ok(feed.includes(toBoth.id));
      assert.ok(!feed.includes(toFollowers.id), "a followers-only post is not on the group feed");
      await rejectsWith(
        postService.listAllPosts({ ...page, audience: "group", groupId: group.id }, strangerId),
        403,
      );
    });

    it("never lets a group-only post through the everyone audience", async () => {
      const feed = ids(await postService.listAllPosts({ ...page, audience: "everyone" }, strangerId));
      assert.ok(feed.includes(toFollowers.id));
      assert.ok(!feed.includes(toGroup.id));
    });

    it("shows each viewer only the profile posts they may see", async () => {
      const asStranger = (await postService.listPostsByUser(authorId, strangerId)).map((p) => p.id);
      assert.ok(!asStranger.includes(toGroup.id));
      assert.ok(asStranger.includes(toFollowers.id));

      const asMember = (await postService.listPostsByUser(authorId, memberId)).map((p) => p.id);
      assert.ok(asMember.includes(toGroup.id), "a member sees the group's posts on the author's profile");

      const asAuthor = await postService.listPostsByUser(authorId, authorId);
      assert.ok(asAuthor.some((p) => p.id === toGroup.id));
    });

    it("tells only the author where a post went", async () => {
      const mine = (await postService.listPostsByUser(authorId, authorId)).find((p) => p.id === toBoth.id);
      assert.deepEqual(mine.sharedTo, { followers: true, groups: [{ id: group.id, name: group.name }] });
      const theirs = (await postService.listPostsByUser(authorId, memberId)).find((p) => p.id === toBoth.id);
      assert.equal(theirs.sharedTo, null);
    });

    it("takes a member's posts off the group's feed when they leave", async () => {
      const session = await finishedSession(memberId);
      const theirs = await postService.createPost({
        userId: memberId,
        sessionId: session.id,
        title: "member's post",
        shareToFollowers: false,
        groupIds: [group.id],
      });
      const before = ids(await postService.listAllPosts({ ...page, audience: "group", groupId: group.id }, authorId));
      assert.ok(before.includes(theirs.id));

      await groupService.leaveGroup(group.id, memberId);
      const after = ids(await postService.listAllPosts({ ...page, audience: "group", groupId: group.id }, authorId));
      assert.ok(!after.includes(theirs.id));
      // The author's own shares to the group are untouched.
      assert.ok(after.includes(toGroup.id));
    });
  });
});
