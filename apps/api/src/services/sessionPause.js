/**
 * Breaks in a study session: how many, how long, and what they do to time.
 *
 * Pure, so it is tested directly (test/sessionPause.test.js). Everything that
 * turns a session into a duration - minutes studied, the focus estimate, the
 * history, analytics, goals, a post's time - goes through activeMs here, so a
 * break is subtracted the same way everywhere and no screen can disagree with
 * another about how long someone studied.
 *
 * WHAT A BREAK IS. A pause for a bathroom trip or a phone call: the clock
 * stops, nothing is sampled, and the time is neither study nor distraction -
 * it simply did not happen as far as the session is concerned. That is what
 * makes it different from leaving the app, which IS counted against the focus
 * estimate (see computeAwayFraction in focusScoring.js).
 *
 * WHY IT IS LIMITED. An unlimited pause would be a way to make any session look
 * perfectly focused: pause whenever attention wanders. So a session gets three
 * breaks of up to five minutes. A break that runs past five minutes is only
 * credited five; the client resumes the session itself at that point, and any
 * time away beyond it is ordinary time away. The limits are enforced here, on
 * the server, because the client is the party with a reason to stretch them.
 */

/** Breaks one session may take. */
export const MAX_PAUSES = 3;

/**
 * The interruption type a finished break is recorded as - see BREAK in the
 * Prisma schema. Written by the server alone.
 */
export const BREAK_TYPE = "BREAK";

/**
 * Whether an interruption was time AWAY - counted against the focus estimate
 * and in every "time away" total - rather than a break, which is neither.
 * Rows without a type are older trips out of the app, and count.
 *
 * @param {{ type?: string | null }} interruption
 */
export const isTimeAway = (interruption) => interruption?.type !== BREAK_TYPE;

/** The longest one break is credited for, in seconds. */
export const MAX_PAUSE_SEC = 5 * 60;

const toMs = (value) => new Date(value).getTime();

/**
 * Seconds of a break still in progress that count, as of `at`: how long it has
 * run, capped at MAX_PAUSE_SEC, and 0 when no break is open.
 *
 * @param {Date | string | null | undefined} pausedAt
 * @param {Date | string} at
 */
export const openPauseSeconds = (pausedAt, at) => {
  if (!pausedAt) return 0;
  const seconds = Math.round((toMs(at) - toMs(pausedAt)) / 1000);
  return Math.min(MAX_PAUSE_SEC, Math.max(0, seconds));
};

/**
 * All the break time a session has taken by `at`: what earlier breaks banked,
 * plus the open one's share.
 *
 * @param {{ pausedSeconds?: number | null, pausedAt?: Date | string | null }} session
 * @param {Date | string} at
 */
export const pausedSecondsAt = (session, at) =>
  (session.pausedSeconds ?? 0) + openPauseSeconds(session.pausedAt, at);

/**
 * How long a session was actually studied, in milliseconds: the wall clock
 * from start to `until`, less its breaks. 0 for a session with no end and no
 * `until`, and never negative - a clock adjustment can make a session appear
 * to end before it started.
 *
 * @param {{ startedAt: Date | string, endedAt?: Date | string | null, pausedSeconds?: number | null, pausedAt?: Date | string | null }} session
 * @param {Date | string | null} [until] - defaults to the session's end
 */
export const activeMs = (session, until = session.endedAt) => {
  if (!until) return 0;
  const wallMs = toMs(until) - toMs(session.startedAt);
  return Math.max(0, wallMs - pausedSecondsAt(session, until) * 1000);
};

/** activeMs in whole minutes, rounded - the shape minutesStudied has always had. */
export const activeMinutes = (session, until = session.endedAt) =>
  Math.max(0, Math.round(activeMs(session, until) / 60_000));

/**
 * What a client needs to draw a session's breaks: whether one is running and
 * until when, and how many are left.
 *
 * `pauseEndsAt` is when the open break stops being credited - the moment the
 * client should resume on its own. Sent rather than left for the client to
 * add up, so the two never disagree about it.
 *
 * @param {{ pausedAt?: Date | null, pauseCount?: number | null, pausedSeconds?: number | null }} session
 * @param {Date} [now]
 */
export const toPauseState = (session, now = new Date()) => {
  const pausedAt = session.pausedAt ?? null;
  const pauseCount = session.pauseCount ?? 0;
  return {
    isPaused: pausedAt !== null,
    pausedAt,
    pauseEndsAt: pausedAt ? new Date(toMs(pausedAt) + MAX_PAUSE_SEC * 1000) : null,
    pauseCount,
    pausesLeft: Math.max(0, MAX_PAUSES - pauseCount),
    pausedSeconds: pausedSecondsAt(session, now),
    maxPauses: MAX_PAUSES,
    maxPauseSec: MAX_PAUSE_SEC,
  };
};
