/**
 * Group changes made on one screen, for a list on another to catch up on.
 *
 * The group screen is pushed over the Study tab, whose Groups view holds a
 * search result list. That list cannot simply be re-read on return - it may
 * be several "Load more" pages deep - so the group screen leaves a note here
 * and the list applies it when it regains focus: chatRequest's one-shot shape.
 *
 *   deleted - drop it: the group no longer exists
 *   changed - refresh it in place: joined, left, renamed, made private...
 *
 * A group left (rather than deleted) stays in the results on purpose - it still
 * exists and can be found - with its "Joined" badge gone.
 */
const deleted = new Set<string>();
const changed = new Set<string>();

export const markGroupDeleted = (groupId: string): void => {
  changed.delete(groupId);
  deleted.add(groupId);
};

export const markGroupChanged = (groupId: string): void => {
  if (!deleted.has(groupId)) changed.add(groupId);
};

/** Everything noted since the last call, cleared as it is read. */
export const consumeGroupChanges = (): { deleted: string[]; changed: string[] } => {
  const result = { deleted: [...deleted], changed: [...changed] };
  deleted.clear();
  changed.clear();
  return result;
};
