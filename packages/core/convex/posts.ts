import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const addPost = mutation({
  args: {
    authorId: v.id("users"),
    title: v.string(),
    caption: v.optional(v.string()),
    durationMinutes: v.number(),
    goalsHit: v.number(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { storageId, ...rest } = args;
    const imageUrl = await ctx.storage.getUrl(storageId);
    if (!imageUrl) throw new Error("Upload failed");
    await ctx.db.insert("posts", { ...rest, imageUrl, likeCount: 0 });
  },
});

export const getPosts = query({
  handler: async (ctx) => {
    const posts = await ctx.db.query("posts").order("desc").collect();
    return posts;
  },
});
