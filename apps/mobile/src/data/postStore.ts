import type { FeedPost } from "./types";

/**
 * The one array of posts, shared by every screen that shows them.
 *
 * It used to live in usePosts' own useState, which was fine while the feed was
 * the only reader. A detail screen breaks that: it has to show a post the feed
 * already loaded, and a like tapped there has to reach the card behind it. Two
 * copies of the same post would have disagreed the moment either changed.
 *
 * Module state rather than context, matching feedSignal - there is exactly one
 * feed, and a provider would be ceremony around an array. Screens read it
 * through useSyncExternalStore, so a write here re-renders every subscriber.
 */
let posts: FeedPost[] = [];
const listeners = new Set<() => void>();

/**
 * Replaced, never mutated in place.
 *
 * useSyncExternalStore compares snapshots by identity: mutating the array and
 * notifying would leave every subscriber holding the same reference and
 * skipping the render.
 */
const commit = (next: FeedPost[]): void => {
  posts = next;
  listeners.forEach((listener) => listener());
};

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * MUST return the same reference when nothing has changed.
 *
 * useSyncExternalStore re-runs this on every render and loops forever if it
 * gets a fresh array each time - which is why every writer below returns the
 * existing `posts` untouched when it has no work to do.
 */
export const getSnapshot = (): FeedPost[] => posts;

/** One page in. Page one replaces, so a refresh drops rows deleted since. */
export const setPage = (page: FeedPost[], pageNumber: number): void => {
  commit(pageNumber === 1 ? page : [...posts, ...page]);
};

export const getPost = (postId: string): FeedPost | undefined =>
  posts.find((post) => post.id === postId);

/**
 * Applies one post's like state.
 *
 * The count moves WITH the flag, never separately: a caller that set one and
 * forgot the other would leave a filled heart above an unchanged number.
 *
 * A no-op when the post already holds that value, which is what makes it safe
 * to call twice - useLikePost calls it once optimistically and again to roll
 * back, and two taps resolving in the same tick must not walk the count off by
 * one. The unchanged case returns the SAME array, so no subscriber re-renders.
 */
export const setLiked = (postId: string, isLiked: boolean): void => {
  const index = posts.findIndex((post) => post.id === postId);
  if (index === -1 || posts[index].isLiked === isLiked) return;

  const post = posts[index];
  const next = [...posts];
  next[index] = {
    ...post,
    isLiked,
    likeCount: post.likeCount + (isLiked ? 1 : -1),
  };
  commit(next);
};

/**
 * Applies one post's report state, and the id needed to undo it.
 *
 * Structurally simpler than setLiked directly above, and the missing half is the
 * interesting part: there is no count to move WITH the flag, because a report
 * count on a post is a fact this product deliberately does not have. See
 * FeedPost.isReported, and the Report model in the schema.
 *
 * reportId travels with the flag rather than separately for the reason the like
 * count does: a filled flag with no id behind it is a report the viewer can see
 * but cannot withdraw, and nothing on screen would explain why.
 *
 * BOTH fields are compared before committing, not just the flag. Comparing only
 * isReported would drop a refreshed id on a post that was already reported - the
 * repeat-file case, where the server answers 200 with the same row - and
 * returning the SAME array when nothing changed is what keeps
 * useSyncExternalStore from re-rendering, and from looping.
 */
export const setReported = (
  postId: string,
  isReported: boolean,
  reportId?: string,
): void => {
  const index = posts.findIndex((post) => post.id === postId);
  if (index === -1) return;

  const post = posts[index];
  if (post.isReported === isReported && post.reportId === reportId) return;

  const next = [...posts];
  next[index] = { ...post, isReported, reportId };
  commit(next);
};

/**
 * Set rather than incremented: the detail screen knows the thread's real
 * length after a write, and an increment would drift from it the moment two
 * comments land between reads.
 */
export const setCommentCount = (postId: string, commentCount: number): void => {
  const index = posts.findIndex((post) => post.id === postId);
  if (index === -1 || posts[index].commentCount === commentCount) return;

  const next = [...posts];
  next[index] = { ...posts[index], commentCount };
  commit(next);
};
