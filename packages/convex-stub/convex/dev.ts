import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const attachAvatar = mutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  handler: async (ctx, { userId, storageId }) => {
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("File not found");
    await ctx.db.patch(userId, { avatarUrl: url });
  },
});

export const attachPostImage = mutation({
  args: { postId: v.id("posts"), storageId: v.id("_storage") },
  handler: async (ctx, { postId, storageId }) => {
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new Error("File not found");
    await ctx.db.patch(postId, { imageUrl: url });
  },
});
