/**
 * A post's session as the feed carries it, and who it was studied with.
 *
 * Pure: no I/O, so it is tested directly (test/studiedWith.test.js), the split
 * sessionHistory.js makes. post.repository.js loads the room relations through
 * studyBuddySelect; this decides who appears.
 */

/**
 * Who a post's session was studied with: everyone else in its group room.
 *
 * A host's session lists its room in `participants`; a joiner's session points
 * at the host's via `hostSession`, whose owner and participants are the room.
 * Either way the author is dropped, as is anyone who appears twice (rejoining
 * a room makes a second session), and anyone with a block between them and the
 * viewer - studyBuddySelect fetched exactly that, and it is stripped here so it
 * never reaches the wire.
 *
 * @returns {object[]} public user fields only, in room order
 */
export const toStudiedWith = (session, authorId) => {
  const room = session.hostSession
    ? [session.hostSession.user, ...session.hostSession.participants.map((p) => p.user)]
    : session.participants.map((p) => p.user);

  const seen = new Set([authorId]);
  const people = [];
  for (const { blocking, blockedBy, ...person } of room) {
    if (seen.has(person.id) || blocking.length > 0 || blockedBy.length > 0) continue;
    seen.add(person.id);
    people.push(person);
  }
  return people;
};

/** The session as the feed carries it - room relations flattened away. */
export const toViewerSession = (session, authorId) => {
  if (!session) return null;
  const { participants: _participants, hostSession: _hostSession, ...rest } = session;
  return { ...rest, studiedWith: toStudiedWith(session, authorId) };
};
