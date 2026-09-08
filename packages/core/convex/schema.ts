import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(), // "lahlan1"
    displayName: v.string(),
    avatarUrl: v.optional(v.string()), // resolved Convex storage URL, or omitted — fall back to a generated default avatar client-side when rendering, not here
  }).index("by_username", ["username"]),

  posts: defineTable({
    authorId: v.id("users"),
    title: v.string(), // "Academic comeback 🌹"
    caption: v.optional(v.string()), // "Library was packed!!! Monster came in clutch tho"
    durationMinutes: v.number(), // 80 → display as "1h 20m"
    goalsHit: v.number(), // 4
    imageUrl: v.string(), // resolved Convex storage URL for the proof photo
    likeCount: v.number(), // denormalized, for the "13"
  }).index("by_author", ["authorId"]),
  // no manual timestamp field — sort the feed with
  // ctx.db.query("posts").order("desc"), which uses the
  // built-in _creationTime automatically

  likes: defineTable({
    postId: v.id("posts"),
    userId: v.id("users"),
  })
    .index("by_post", ["postId"])
    .index("by_user_and_post", ["userId", "postId"]), // fast "did I like this" check
});
