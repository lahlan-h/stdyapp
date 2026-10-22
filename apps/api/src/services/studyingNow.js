/**
 * Who in a study group is studying right now - the group feed's live strip.
 *
 * Pure: no I/O, so it is tested directly (test/studyingNow.test.js), the split
 * studiedWith.js makes. studyGroup.service.js loads the open sessions of the
 * group's visible members; this decides what each row says.
 *
 * ANY session counts, not only one started in this group. The strip answers
 * "which of my group is studying", and someone revising solo at midnight is
 * exactly who a night-owls group wants to see - whether they are in one of the
 * group's rooms is a different question, which the group page's "Studying now"
 * still answers.
 */
import { activeMs } from "./sessionPause.js";

/** "Ada Lovelace", "Ada", or null - leaderboard rows use the same rule. */
const displayNameOf = (user) => {
  const name = [user.firstName, user.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || null;
};

/**
 * One row per person studying, longest-running first, the viewer first of all.
 *
 * Someone can have two sessions open at once - a phone and a tablet, or one a
 * crash left behind that has not been closed yet - and the strip shows people,
 * not sessions, so the NEWEST is kept: it is the one they are using.
 *
 * The viewer goes first because the strip's first job is to show you yourself
 * in it - proof your session counts - before it shows anyone else.
 *
 * @param {Array<{
 *   id: string,
 *   userId: string,
 *   groupId: string|null,
 *   startedAt: Date,
 *   plannedMinutes: number|null,
 *   pausedAt?: Date|null,
 *   pausedSeconds?: number,
 *   user: { id: string, username: string, firstName?: string|null, lastName?: string|null, avatarUrl?: string|null },
 * }>} sessions - open sessions, any order
 * @param {{ groupId: string, viewerId: string, now?: Date }} context
 */
export const toStudyingNow = (sessions, { groupId, viewerId, now = new Date() }) => {
  const newestByUser = new Map();
  for (const session of sessions) {
    const kept = newestByUser.get(session.userId);
    if (!kept || session.startedAt > kept.startedAt) newestByUser.set(session.userId, session);
  }

  return [...newestByUser.values()]
    .sort((a, b) => {
      if (a.userId === viewerId) return -1;
      if (b.userId === viewerId) return 1;
      return a.startedAt - b.startedAt || (a.userId < b.userId ? -1 : 1);
    })
    .map((session) => ({
      userId: session.user.id,
      username: session.user.username,
      displayName: displayNameOf(session.user),
      avatarUrl: session.user.avatarUrl ?? null,
      startedAt: session.startedAt,
      // How long they have STUDIED so far, breaks left out, as of `now` - so
      // the strip says "42m" for 42 minutes of study, not of wall clock. A
      // client adds the seconds since it fetched, while they are not on a break.
      studiedSeconds: Math.round(activeMs(session, now) / 1000),
      // On one of their breaks right now - the strip shows it instead of a time.
      onBreak: Boolean(session.pausedAt),
      plannedMinutes: session.plannedMinutes,
      // Whether they are studying IN this group - one of its rooms - rather
      // than on their own. Never which other group: that is not this group's
      // business.
      studyingHere: session.groupId === groupId,
      isMine: session.userId === viewerId,
    }));
};
