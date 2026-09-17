/**
 * A one-bit "the feed has changed" flag.
 *
 * Creating a post happens on a modal that is dismissed back onto the feed, and
 * the feed has no way to know. Refreshing on every focus instead would throw
 * away every page loaded past the first each time the user switches tabs, to
 * catch a change that almost never happened.
 *
 * Module state rather than context because there is exactly one feed and
 * nothing renders differently for it - a provider would be ceremony around a
 * boolean.
 */
let isStale = false;

/** Called after a write that the feed should pick up. */
export const markFeedStale = (): void => {
  isStale = true;
};

/** Returns whether the feed needs re-reading, and clears the flag. */
export const consumeFeedStale = (): boolean => {
  const wasStale = isStale;
  isStale = false;
  return wasStale;
};
