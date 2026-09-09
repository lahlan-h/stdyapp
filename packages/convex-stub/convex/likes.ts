import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Like a post, at most once per user.
 *
 * IDEMPOTENT, and it has to be. This used to insert a row and increment
 * likeCount unconditionally, so a double-tap - or any retry of a mutation the
 * client thought had failed - permanently inflated the count and left a
 * duplicate row behind. There was no way to get either back.
 *
 * The by_user_and_post index this reads was already declared in schema.ts for
 * exactly this check and had never been used by anything.
 */
export const addLike = mutation({
  args: { postId: v.id("posts"), userId: v.id("users") },
  handler: async (ctx, { postId, userId }) => {
    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_and_post", (q) => q.eq("userId", userId).eq("postId", postId))
      .unique();

    if (existing) return { liked: true, changed: false };

    await ctx.db.insert("likes", { postId, userId });

    // Read AFTER the insert: likeCount is denormalized onto the post, so it has
    // to move in the same mutation or the feed shows a stale number.
    const post = await ctx.db.get(postId);
    if (post) await ctx.db.patch(postId, { likeCount: post.likeCount + 1 });

    return { liked: true, changed: true };
  },
});

/** Unlike a post. Also idempotent - unliking something you never liked is a no-op. */
export const removeLike = mutation({
  args: { postId: v.id("posts"), userId: v.id("users") },
  handler: async (ctx, { postId, userId }) => {
    const existing = await ctx.db
      .query("likes")
      .withIndex("by_user_and_post", (q) => q.eq("userId", userId).eq("postId", postId))
      .unique();

    if (!existing) return { liked: false, changed: false };

    await ctx.db.delete(existing._id);

    const post = await ctx.db.get(postId);
    // Floored at 0: a count that has drifted must not be driven negative by an
    // otherwise correct unlike.
    if (post) await ctx.db.patch(postId, { likeCount: Math.max(0, post.likeCount - 1) });

    return { liked: false, changed: true };
  },
});

export const getLikes = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, { postId }) => {
    return await ctx.db
      .query("likes")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();
  },
});
