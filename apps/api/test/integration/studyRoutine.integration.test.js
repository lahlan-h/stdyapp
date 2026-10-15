import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Integration tests for routines and their todo items: real Prisma, real
 * Postgres, no mocks. Skipped unless TEST_DATABASE_URL is set - see the note at
 * the top of focus.integration.test.js, which this file follows exactly.
 *
 * Covers what the list/reset/reorder/preview work added: completedCount on
 * the list, item positions, reset, reorder, the non-owner preview, and the
 * block gate on preview and clone.
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = TEST_DB ? false : "TEST_DATABASE_URL not set";

let prisma, routineService, closeRedis, closeRabbitMq;
let ownerId, otherId;

if (TEST_DB) {
  process.env.DATABASE_URL = TEST_DB;
  process.env.DIRECT_URL = TEST_DB;
  ({ prisma, closeRedis, closeRabbitMq } = await import("@stdyapp/core"));
  routineService = await import("../../src/services/studyRoutine.service.js");
}

/**
 * Routines first: study_routines.userId is RESTRICT. Todo items cascade from
 * their routine, and clones only SetNull, so the order within a user does not
 * matter.
 */
const destroyUser = async (id) => {
  await prisma.studyRoutine.deleteMany({ where: { userId: id } });
  await prisma.block.deleteMany({ where: { OR: [{ blockerId: id }, { blockedId: id }] } });
  await prisma.user.delete({ where: { id } }).catch(() => {});
};

const makeUser = async (suffix) => {
  const user = await prisma.user.create({
    data: {
      email: `routine-${suffix}-${randomUUID()}@test.local`,
      username: `routine_${suffix}_${randomUUID().slice(0, 8)}`,
      passwordHash: "not-a-real-hash",
    },
    select: { id: true },
  });
  return user.id;
};

/** A routine owned by `userId` with the given item titles, added in order. */
const makeRoutine = async (userId, titles) => {
  const routine = await routineService.createRoutine({ userId, title: "Test routine" });
  for (const title of titles) {
    await routineService.addTodoItem(routine.id, userId, { title, dueDate: null });
  }
  return routineService.getRoutine(routine.id, userId);
};

const titlesOf = (routine) => routine.todoItems.map((item) => item.title);

/** Asserts a promise rejects with an HTTP-style status. */
const rejectsWith = (promise, status) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.status, status);
    return true;
  });

describe("routines against a real database", { skip }, () => {
  before(async () => {
    ownerId = await makeUser("owner");
    otherId = await makeUser("other");
  });

  after(async () => {
    try {
      await destroyUser(ownerId);
      await destroyUser(otherId);
    } finally {
      await Promise.allSettled([prisma.$disconnect(), closeRedis(), closeRabbitMq()]);
    }
  });

  it("numbers new items in the order they are added", async () => {
    const routine = await makeRoutine(ownerId, ["a", "b", "c"]);
    assert.deepEqual(titlesOf(routine), ["a", "b", "c"]);
    assert.deepEqual(
      routine.todoItems.map((item) => item.position),
      [0, 1, 2],
    );
  });

  it("reports how many items are done on the list", async () => {
    const routine = await makeRoutine(ownerId, ["one", "two", "three"]);
    const [first, second] = routine.todoItems;
    await routineService.updateTodoItem(routine.id, first.id, ownerId, { isComplete: true });
    await routineService.updateTodoItem(routine.id, second.id, ownerId, { isComplete: true });

    const empty = await routineService.createRoutine({ userId: ownerId, title: "Empty" });

    const list = await routineService.listMyRoutines(ownerId);
    const row = list.find((r) => r.id === routine.id);
    assert.equal(row._count.todoItems, 3, "_count is kept for older clients");
    assert.equal(row.completedCount, 2);
    assert.equal(list.find((r) => r.id === empty.id).completedCount, 0);
  });

  it("unticks every item on reset, and only the owner may reset", async () => {
    const routine = await makeRoutine(ownerId, ["x", "y"]);
    for (const item of routine.todoItems) {
      await routineService.updateTodoItem(routine.id, item.id, ownerId, { isComplete: true });
    }

    await rejectsWith(routineService.resetRoutine(routine.id, otherId), 403);

    const reset = await routineService.resetRoutine(routine.id, ownerId);
    assert.ok(reset.todoItems.every((item) => item.isComplete === false));

    // Resetting a routine with nothing ticked is fine, not an error.
    const again = await routineService.resetRoutine(routine.id, ownerId);
    assert.equal(again.todoItems.length, 2);
  });

  it("reorders items, and refuses a list that is not exactly the routine's items", async () => {
    const routine = await makeRoutine(ownerId, ["first", "second", "third"]);
    const [a, b, c] = routine.todoItems.map((item) => item.id);

    const reordered = await routineService.reorderTodoItems(routine.id, ownerId, [c, a, b]);
    assert.deepEqual(titlesOf(reordered), ["third", "first", "second"]);

    // A later add goes to the END of the new order, not by creation time.
    await routineService.addTodoItem(routine.id, ownerId, { title: "fourth", dueDate: null });
    const withFourth = await routineService.getRoutine(routine.id, ownerId);
    assert.deepEqual(titlesOf(withFourth), ["third", "first", "second", "fourth"]);

    // Missing an item: refused.
    await rejectsWith(routineService.reorderTodoItems(routine.id, ownerId, [a, b, c]), 400);

    // An item from someone else's routine: refused.
    const foreign = await makeRoutine(otherId, ["not yours"]);
    const d = withFourth.todoItems[3].id;
    await rejectsWith(
      routineService.reorderTodoItems(routine.id, ownerId, [a, b, c, foreign.todoItems[0].id]),
      400,
    );

    // Not the owner: refused before the list is even checked.
    await rejectsWith(routineService.reorderTodoItems(routine.id, otherId, [a, b, c, d]), 403);

    const unchanged = await routineService.getRoutine(routine.id, ownerId);
    assert.deepEqual(titlesOf(unchanged), ["third", "first", "second", "fourth"]);
  });

  it("shows a non-owner titles and due dates, but never anyone's progress", async () => {
    const routine = await makeRoutine(ownerId, ["read", "write"]);
    await routineService.updateTodoItem(routine.id, routine.todoItems[0].id, ownerId, {
      isComplete: true,
    });

    const preview = await routineService.previewRoutine(routine.id, otherId);
    assert.equal(preview.isOwn, false);
    assert.equal(preview.todoCount, 2);
    assert.equal(preview.owner.id, ownerId);
    assert.deepEqual(titlesOf(preview), ["read", "write"]);
    for (const item of preview.todoItems) {
      assert.deepEqual(Object.keys(item).sort(), ["dueDate", "id", "title"]);
    }
    assert.equal("userId" in preview, false, "owner is exposed as `owner`, not raw userId");

    assert.equal((await routineService.previewRoutine(routine.id, ownerId)).isOwn, true);
    await rejectsWith(routineService.previewRoutine(randomUUID(), otherId), 404);
  });

  it("hides a routine from preview and clone across a block, in both directions", async () => {
    const routine = await makeRoutine(ownerId, ["secret"]);

    await prisma.block.create({ data: { blockerId: ownerId, blockedId: otherId } });
    try {
      await rejectsWith(routineService.previewRoutine(routine.id, otherId), 404);
      await rejectsWith(routineService.cloneRoutine(routine.id, otherId), 404);
    } finally {
      await prisma.block.deleteMany({ where: { blockerId: ownerId, blockedId: otherId } });
    }

    await prisma.block.create({ data: { blockerId: otherId, blockedId: ownerId } });
    try {
      await rejectsWith(routineService.previewRoutine(routine.id, otherId), 404);
    } finally {
      await prisma.block.deleteMany({ where: { blockerId: otherId, blockedId: ownerId } });
    }

    // With no block, the same calls work again.
    assert.equal((await routineService.previewRoutine(routine.id, otherId)).todoCount, 1);
  });

  it("clones in the source's order, renumbered, with progress reset", async () => {
    const source = await makeRoutine(ownerId, ["p", "q", "r"]);
    const [p, q, r] = source.todoItems.map((item) => item.id);
    await routineService.reorderTodoItems(source.id, ownerId, [r, p, q]);
    await routineService.updateTodoItem(source.id, r, ownerId, { isComplete: true });

    const clone = await routineService.cloneRoutine(source.id, otherId);
    assert.equal(clone.userId, otherId);
    assert.equal(clone.sourceRoutineId, source.id);
    assert.deepEqual(titlesOf(clone), ["r", "p", "q"]);
    assert.deepEqual(clone.todoItems.map((item) => item.position), [0, 1, 2]);
    assert.ok(clone.todoItems.every((item) => item.isComplete === false));
  });
});
