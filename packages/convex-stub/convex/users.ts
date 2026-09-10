import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const addUser = mutation({
  args: {
    username: v.string(),
    displayName: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { storageId, ...rest }) => {
    let avatarUrl: string | undefined;
    if (storageId) {
      avatarUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
      if (!avatarUrl) throw new Error("Upload failed");
    }
    return await ctx.db.insert("users", { ...rest, avatarUrl });
  },
});

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return ctx.db.get(userId);
  },
});
