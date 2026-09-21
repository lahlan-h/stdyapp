import { useSyncExternalStore } from "react";

import * as postStore from "./postStore";
import type { FeedPost } from "./types";

/**
 * One post out of the shared store.
 *
 * Deliberately does NOT fetch. The only route into the detail screen is a tap
 * on a card the feed has already loaded, so the post is in the store by the
 * time this runs, and a request would re-fetch what is already on screen.
 *
 * `undefined` is therefore not an error state but a real one: the store is
 * empty on a cold start - a reload while the screen is open, or a deep link
 * straight to it - because nothing has read the feed yet. The screen says so
 * rather than spinning forever.
 *
 * Fixing that properly needs a single-post read the API does not have:
 * GET /api/posts/:id is owner-only and 403s on anyone else's post, and returns
 * a bare row with no author, counts or like state. A GET /api/posts/:id/detail
 * mirroring the feed row is what would let this screen stand alone.
 */
export const usePost = (postId: string): FeedPost | undefined => {
  // Subscribes to the whole array rather than the one post: every write
  // replaces it, and a like or comment count landing on THIS post has to reach
  // the screen.
  const posts = useSyncExternalStore(postStore.subscribe, postStore.getSnapshot);

  return posts.find((post) => post.id === postId);
};
