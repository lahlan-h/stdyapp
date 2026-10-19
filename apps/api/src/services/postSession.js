/**
 * A post's session as the feed carries it: its numbers, who it was studied
 * with, and the badges it earned.
 *
 * Pure: no I/O, so it is tested directly (test/postSession.test.js). The one
 * fact that needs a query - whether it was a personal best - is looked up for
 * the whole page in post.repository.js and passed in.
 */
import { toStudiedWith } from "./studiedWith.js";
import { activeMinutes } from "./sessionPause.js";

/**
 * The badges a post can show, in display order. Keys, not sentences: the app
 * owns the wording and the icons, and ignores a key it does not know, so a new
 * badge can ship from the API first.
 *
 *   PERSONAL_BEST - more focus points than any earlier session by the author
 *   HIT_PLAN      - studied at least the minutes planned at the start
 *   PHONE_FREE    - a measured session with no app exits or phone pickups
 */
export const HIGHLIGHTS = ["PERSONAL_BEST", "HIT_PLAN", "PHONE_FREE"];

/**
 * Shorter than this and "phone-free" says nothing - anyone can leave their
 * phone alone for five minutes.
 */
export const PHONE_FREE_MIN_MINUTES = 10;

/**
 * Whole minutes studied, breaks left out, or null while the session is
 * running. activeMinutes is the one definition every duration shares.
 */
const durationMinutes = (session) => (session.endedAt ? activeMinutes(session) : null);

/**
 * Which of HIGHLIGHTS this session earned. Only a FINISHED session earns any:
 * a running one has no duration to judge.
 *
 * PHONE_FREE also needs a focus estimate. Interruptions are only recorded
 * while focus tracking runs, so a session without one has zero of them by
 * default - and calling that "phone-free" would be making it up.
 *
 * @param {object} session - as post.repository.js selects it
 * @param {boolean} isPersonalBest - from findPersonalBestSessionIds
 * @returns {string[]} a subset of HIGHLIGHTS, in its order
 */
export const toHighlights = (session, isPersonalBest) => {
  const minutes = durationMinutes(session);
  if (minutes === null) return [];

  const earned = {
    PERSONAL_BEST: isPersonalBest,
    HIT_PLAN: Boolean(session.plannedMinutes) && minutes >= session.plannedMinutes,
    PHONE_FREE:
      session.focusScore !== null &&
      minutes >= PHONE_FREE_MIN_MINUTES &&
      session._count.interruptions === 0,
  };

  return HIGHLIGHTS.filter((key) => earned[key]);
};

/**
 * The session as the feed carries it. The room relations and the interruption
 * count are folded into studiedWith and highlights and dropped, so neither a
 * join shape nor the block relations studyBuddySelect loads reach the wire.
 *
 * @param {object | null} session
 * @param {string} authorId
 * @param {{ isPersonalBest?: boolean, viewerId?: string }} [facts]
 */
export const toViewerSession = (
  session,
  authorId,
  { isPersonalBest = false, viewerId } = {},
) => {
  if (!session) return null;

  const {
    participants: _participants,
    hostSession: _hostSession,
    _count: _counts,
    ...rest
  } = session;

  return {
    ...rest,
    studiedWith: toStudiedWith(session, authorId, viewerId),
    highlights: toHighlights(session, isPersonalBest),
  };
};
