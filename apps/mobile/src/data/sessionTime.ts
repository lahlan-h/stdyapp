/**
 * How long a session was STUDIED - the wall clock from start to end, less its
 * breaks.
 *
 * The client's copy of activeMs in apps/api/src/services/sessionPause.js, for
 * the places the app works a duration out itself from a session row rather
 * than being sent one: a post's time, the profile's totals, a session's detail.
 * They must say what the server says - a 65-minute session with a five-minute
 * break was 60 minutes of study everywhere - so the rule lives once, here.
 *
 * Breaks: three per session, each credited for at most five minutes, mirrored
 * from the same file so the Study tab can count down and grey out on its own.
 */
export const MAX_BREAKS = 3;
export const MAX_BREAK_SEC = 5 * 60;

interface TimedSession {
  startedAt: string | number | Date;
  endedAt: string | number | Date | null;
  /** Credited seconds of the session's finished breaks. Older rows have none. */
  pausedSeconds?: number | null;
}

/** Whole seconds studied, breaks left out; 0 for a session with no end yet. */
export const studiedSeconds = ({ startedAt, endedAt, pausedSeconds }: TimedSession): number => {
  if (!endedAt) return 0;
  const wallMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Math.max(0, Math.round(wallMs / 1000 - (pausedSeconds ?? 0)));
};

/** studiedSeconds in whole minutes, rounded - as the server rounds minutesStudied. */
export const studiedMinutes = (session: TimedSession): number =>
  Math.round(studiedSeconds(session) / 60);
