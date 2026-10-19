/**
 * Who a post's session was studied with.
 *
 * Pure: no I/O, so it is tested directly (test/studiedWith.test.js), the split
 * sessionHistory.js makes. post.repository.js loads the room relations through
 * studyBuddySelect; this decides who appears. postSession.js calls it.
 */

/**
 * Who a post's session was studied with: everyone else in its group room.
 *
 * A host's session lists its room in `participants`; a joiner's session points
 * at the host's via `hostSession`, whose owner and participants are the room.
 * Either way the author is dropped, as is anyone who appears twice (rejoining
 * a room makes a second session), anyone with a block between them and the
 * viewer, and any private account the viewer is not an approved follower of -
 * studyBuddySelect fetched exactly that, and it is stripped here so it never
 * reaches the wire.
 *
 * The viewer always sees themselves: their own row comes back private and with
 * no follow of themselves, which would otherwise hide them from a room they
 * were in.
 *
 * @param {string} [viewerId] - who is looking
 * @returns {object[]} public user fields only, in room order
 */
export const toStudiedWith = (session, authorId, viewerId) => {
  const room = session.hostSession
    ? [session.hostSession.user, ...session.hostSession.participants.map((p) => p.user)]
    : session.participants.map((p) => p.user);

  const seen = new Set([authorId]);
  const people = [];
  for (const { blocking, blockedBy, isPrivate = false, followers = [], ...person } of room) {
    if (seen.has(person.id) || blocking.length > 0 || blockedBy.length > 0) continue;
    if (isPrivate && person.id !== viewerId && followers.length === 0) continue;
    seen.add(person.id);
    people.push(person);
  }
  return people;
};
