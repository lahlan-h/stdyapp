import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const addPost = mutation({
  args: {
    authorId: v.id("users"),
    title: v.string(),
    caption: v.optional(v.string()),
    durationMinutes: v.number(),
    goalsHit: v.number(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { storageId, ...rest } = args;
    let imageUrl: string | undefined = undefined;

    if (storageId) {
      const url = await ctx.storage.getUrl(storageId);
      if (!url) throw new Error("Upload failed");
      imageUrl = url;
    }

    return await ctx.db.insert("posts", { ...rest, imageUrl, likeCount: 0 });
  },
});

/**
 * One page of the feed, newest first, with each post's author already attached.
 *
 * THE AUTHOR IS JOINED HERE ON PURPOSE. The client used to render the feed and
 * then fire a getUser query per card, so an N-post feed opened N+1 live
 * subscriptions and every card popped in separately. Joining server-side makes
 * it one subscription for the whole page.
 *
 * PAGINATED, where this used to .collect() the entire posts table on every
 * feed load. That read every row a user would never scroll to, and got linearly
 * worse as the app filled up.
 *
 * `author` is nullable rather than filtered here: dropping rows inside a
 * paginated query would return short pages and confuse the cursor. The client
 * drops them - see toFeedPost in apps/mobile/src/data.
 */
export const getPosts = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db.query("posts").order("desc").paginate(paginationOpts);

    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (post) => ({
          ...post,
          author: await ctx.db.get(post.authorId),
        })),
      ),
    };
  },
});
