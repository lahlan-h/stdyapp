import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { listAllPostsQuerySchema } from "../src/validation/post.validation.js";

const GROUP_ID = "8a4b7c1e-2f3d-4e5a-9b6c-7d8e9f0a1b2c";

/**
 * The feed's audience parameters. The most important case is the first: a
 * client that sends no audience - every build before this one - must still get
 * the whole feed, not an error and not a narrower one.
 */
describe("listAllPostsQuerySchema.audience", () => {
  it("defaults to everyone, so older clients see the feed they always did", () => {
    const parsed = listAllPostsQuerySchema.parse({});
    assert.equal(parsed.audience, "everyone");
    assert.equal(parsed.groupId, undefined);
  });

  it("accepts following on its own", () => {
    assert.equal(listAllPostsQuerySchema.safeParse({ audience: "following" }).success, true);
  });

  it("accepts a group feed with its group", () => {
    const parsed = listAllPostsQuerySchema.parse({ audience: "group", groupId: GROUP_ID });
    assert.equal(parsed.groupId, GROUP_ID);
  });

  it("refuses a group feed with no group", () => {
    assert.equal(listAllPostsQuerySchema.safeParse({ audience: "group" }).success, false);
  });

  it("refuses a groupId on any other audience rather than ignoring it", () => {
    for (const audience of ["everyone", "following"]) {
      assert.equal(
        listAllPostsQuerySchema.safeParse({ audience, groupId: GROUP_ID }).success,
        false,
        `${audience} with a groupId should be refused`,
      );
    }
  });

  it("refuses an unknown audience and a malformed groupId", () => {
    assert.equal(listAllPostsQuerySchema.safeParse({ audience: "friends" }).success, false);
    assert.equal(
      listAllPostsQuerySchema.safeParse({ audience: "group", groupId: "not-a-uuid" }).success,
      false,
    );
  });
});
