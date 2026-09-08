import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const addLike = mutation({
  args: { postId: v.id("posts"), userId: v.id("users") },
  handler: async (ctx, { postId, userId }) => {
    await ctx.db.insert("likes", { postId, userId });
    const post = await ctx.db.get(postId);
    if (post) await ctx.db.patch(postId, { likeCount: post.likeCount + 1 });
  },
});
