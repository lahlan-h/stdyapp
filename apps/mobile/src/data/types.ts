/**
 * The shapes the UI renders.
 *
 * Deliberately NOT Convex's Doc<"posts"> / Doc<"users">. These are the app's own
 * domain types, so swapping the backend underneath this directory changes the
 * mapping functions and nothing in the component tree. Anything Convex-specific
 * - Id<>, _id, _creationTime - stops here and must not appear in a component.
 */

export interface FeedAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface FeedPost {
  id: string;
  title: string;
  caption?: string;
  durationMinutes: number;
  goalsHit: number;
  imageUrl?: string;
  /** Denormalized on the post; never derived by counting like rows client-side. */
  likeCount: number;
  /** Epoch milliseconds. */
  createdAt: number;
  author: FeedAuthor;
}
