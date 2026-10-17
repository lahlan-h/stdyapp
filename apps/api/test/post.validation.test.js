import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  listAllPostsQuerySchema,
  createPhotoUploadsSchema,
  createPostSchema,
  MAX_SHARE_GROUPS,
} from "../src/validation/post.validation.js";
import { MAX_POST_PHOTOS } from "../src/config/upload.js";

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

describe("createPhotoUploadsSchema", () => {
  const photo = (overrides = {}) => ({ mimeType: "image/jpeg", sizeBytes: 500_000, ...overrides });
  const photos = (count) => Array.from({ length: count }, () => photo());

  it(`accepts one to ${MAX_POST_PHOTOS} photos, with or without dimensions`, () => {
    assert.equal(createPhotoUploadsSchema.safeParse({ photos: [photo()] }).success, true);
    assert.equal(
      createPhotoUploadsSchema.safeParse({
        photos: [photo({ width: 2048, height: 1536 }), ...photos(MAX_POST_PHOTOS - 1)],
      }).success,
      true,
    );
  });

  it(`refuses none, or more than ${MAX_POST_PHOTOS}`, () => {
    assert.equal(createPhotoUploadsSchema.safeParse({ photos: [] }).success, false);
    assert.equal(
      createPhotoUploadsSchema.safeParse({ photos: photos(MAX_POST_PHOTOS + 1) }).success,
      false,
    );
  });

  it("refuses a type the sniffer cannot identify, and anything over 5 MB", () => {
    assert.equal(
      createPhotoUploadsSchema.safeParse({ photos: [photo({ mimeType: "image/heic" })] }).success,
      false,
    );
    assert.equal(
      createPhotoUploadsSchema.safeParse({ photos: [photo({ sizeBytes: 5 * 1024 * 1024 + 1 })] })
        .success,
      false,
    );
  });

  it("refuses anything that would name an object - there is no url or key field", () => {
    assert.equal(
      createPhotoUploadsSchema.safeParse({ photos: [photo({ url: "https://evil.example/x.jpg" })] })
        .success,
      false,
    );
  });
});

describe("createPostSchema.photoIds", () => {
  const id = (n) => `3f2504e0-4f89-41d3-9a0c-0305e82c33${String(n).padStart(2, "0")}`;
  const ids = (count) => Array.from({ length: count }, (_, n) => id(n));

  it("is optional, so a text-only post sends none", () => {
    assert.equal(createPostSchema.safeParse({ title: "Notes", caption: "Done" }).success, true);
  });

  it(`accepts up to ${MAX_POST_PHOTOS} distinct ids`, () => {
    assert.equal(
      createPostSchema.safeParse({ title: "Desk", photoIds: ids(MAX_POST_PHOTOS) }).success,
      true,
    );
  });

  it("refuses one too many, a repeat, a non-uuid, and a photoUrl", () => {
    for (const body of [
      { title: "Desk", photoIds: ids(MAX_POST_PHOTOS + 1) },
      { title: "Desk", photoIds: [id(1), id(1)] },
      { title: "Desk", photoIds: ["not-a-uuid"] },
      { title: "Desk", photoUrl: "https://cdn.example.com/x.jpg" },
    ]) {
      assert.equal(createPostSchema.safeParse(body).success, false, JSON.stringify(body));
    }
  });
});

/** Who a post is shared with. "At least one" is the service's rule, not this one's. */
describe("createPostSchema sharing", () => {
  const OTHER_GROUP = "1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  it("lets an older client send neither field", () => {
    const parsed = createPostSchema.parse({ title: "Notes", caption: "Done" });
    assert.equal(parsed.shareToFollowers, undefined);
    assert.equal(parsed.groupIds, undefined);
  });

  it("takes followers and groups together", () => {
    const parsed = createPostSchema.parse({
      title: "Notes",
      shareToFollowers: false,
      groupIds: [GROUP_ID, OTHER_GROUP],
    });
    assert.equal(parsed.shareToFollowers, false);
    assert.deepEqual(parsed.groupIds, [GROUP_ID, OTHER_GROUP]);
  });

  it("refuses a repeated group, a bad id, and too many groups", () => {
    for (const groupIds of [
      [GROUP_ID, GROUP_ID],
      ["night-owls"],
      Array.from({ length: MAX_SHARE_GROUPS + 1 }, (_, i) =>
        `${String(i).padStart(8, "0")}-2f3d-4e5a-9b6c-7d8e9f0a1b2c`,
      ),
    ]) {
      assert.equal(createPostSchema.safeParse({ title: "x", groupIds }).success, false);
    }
  });
});
