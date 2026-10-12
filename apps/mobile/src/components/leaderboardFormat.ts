import type { Leaderboard, LeaderboardEntry, LeaderboardMetric } from "@data";

/**
 * Wording shared by the leaderboard screen and its teaser on Analytics, so the
 * two never describe the same standing in different words.
 */

/** 45 -> "45m", 125 -> "2h 5m", 120 -> "2h". analytics.tsx's format. */
export const formatMinutes = (minutes: number): string => {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

export const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** The number in a row, and the small word under it. */
export const formatValue = (metric: LeaderboardMetric, value: number) => {
  switch (metric) {
    case "weightedMinutes":
      return { value: formatMinutes(value), unit: "focus time" };
    case "focusScore":
      // "est." wherever the number appears: it is an estimate from phone
      // signals, and a bare number in a ranked list would read as a measurement.
      return { value: String(Math.round(value)), unit: "avg focus est." };
    case "tasksCompleted":
      return { value: String(Math.round(value)), unit: value === 1 ? "task" : "tasks" };
  }
};

/** A difference between two people, in the metric's own unit. */
const formatGap = (metric: LeaderboardMetric, gap: number) => {
  switch (metric) {
    case "weightedMinutes":
      return formatMinutes(gap);
    case "focusScore":
      return plural(Math.round(gap), "point");
    case "tasksCompleted":
      return plural(Math.round(gap), "task");
  }
};

export const nameOf = (row: Pick<LeaderboardEntry, "displayName" | "username">) =>
  row.displayName ?? row.username ?? "Someone";

/** First name only, for sentences: "4m ahead of Sam", not of "Sam Lee". */
export const shortNameOf = (row: Pick<LeaderboardEntry, "displayName" | "username">) =>
  row.displayName?.split(" ")[0] ?? row.username ?? "someone";

export interface Standing {
  /** "#2", or "–" when unranked. */
  rankLabel: string;
  /** "of 5", or a reason for having no rank. */
  outOf: string;
  /** The one sentence that says where you stand and what it would take. */
  gapText: string;
  /** 0-1: how close you are to the person above. 1 at the top. */
  progress: number;
}

/**
 * Where the caller stands, and the distance to the next place up.
 *
 * The gap is the point of a leaderboard for accountability: "you are 3rd" is a
 * fact, "6m behind Sam" is a reason to start a session.
 */
export const describeStanding = (board: Leaderboard): Standing => {
  const { me, entries, metric } = board;
  const ranked = entries.length;

  if (me.rank === null) {
    const reason =
      !me.qualified && metric === "focusScore"
        ? `${plural(me.sessionsNeeded, "more scored session")} to rank`
        : "Finish a study session to get on the board";
    return { rankLabel: "–", outOf: "unranked", gapText: reason, progress: 0 };
  }

  const myIndex = entries.findIndex((e) => e.userId === me.userId);
  const above = myIndex > 0 ? entries[myIndex - 1] : undefined;
  const below = myIndex >= 0 ? entries[myIndex + 1] : undefined;

  let gapText: string;
  let progress = 1;

  if (!above) {
    gapText = below
      ? me.value === below.value
        ? `Tied with ${shortNameOf(below)}`
        : `${formatGap(metric, me.value - below.value)} ahead of ${shortNameOf(below)}`
      : board.followingCount === 0
        ? "Top of the board - follow people to give it a race"
        : "Top of the board";
  } else if (above.value === me.value) {
    gapText = `Tied with ${shortNameOf(above)}`;
  } else {
    gapText = `${formatGap(metric, above.value - me.value)} behind ${shortNameOf(above)}`;
    progress = above.value > 0 ? Math.max(0, Math.min(1, me.value / above.value)) : 0;
  }

  return {
    rankLabel: `#${me.rank}`,
    outOf: `of ${Math.max(ranked, me.rank)}`,
    gapText,
    progress,
  };
};
