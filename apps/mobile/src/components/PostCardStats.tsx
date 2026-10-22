import { View, Text } from "react-native";

import { useTheme, useStyles } from "@theme";
import { formatDuration } from "@stdyapp/shared";
import type { FeedSession } from "@data";

import { focusBand, focusBandColor } from "./focusBand";

interface PostCardStatsProps {
  /** Absent on a post that was not made about a session, which is most of them. */
  session?: FeedSession;
}

/** Stands in for a number that is not known yet, rather than inventing one. */
const PLACEHOLDER = "—";

/**
 * The session numbers under a post.
 *
 * Rendered on every card, including posts with no session at all - the row is
 * part of the card's shape, so it holds its place with a dash rather than
 * appearing and disappearing down the feed.
 *
 * Time is real whenever a session is linked AND finished. A running session has
 * no duration, and zero would be a lie that corrects itself the moment it ends,
 * so it says so instead.
 *
 * Focus is the session's 0-100 focus estimate, coloured by the same bands the
 * session recap uses (focusBand.ts), so a 55 reads the same everywhere. A dash
 * for a session that was never measured - not 0, which means "measured, bad".
 *
 * Tasks is how much of the session's task list got ticked off - "4/5". A dash
 * when the session had no list. It replaced "Goals Reached", which could only
 * ever show a dash: a Goal is one row per user per period and is never attached
 * to a session, so there was nothing per post to count.
 */
const PostCardStats = ({ session }: PostCardStatsProps) => {
  const { colors } = useTheme();
  const homeStyles = useStyles("home");

  const time = !session
    ? PLACEHOLDER
    : session.durationMinutes === null
      ? "In progress"
      : formatDuration(session.durationMinutes);
  const tasks = session?.tasks ? `${session.tasks.done}/${session.tasks.total}` : PLACEHOLDER;
  const score = session?.focusScore ?? null;
  const band = focusBand(score);

  return (
    <View style={homeStyles.statsContainer}>
      <View>
        <Text style={homeStyles.stats}>Time</Text>
        <Text style={homeStyles.regular}>{time}</Text>
      </View>
      <View accessible accessibilityLabel={`Focus: ${score === null ? "no reading" : `${score}, ${band.label}`}`}>
        <Text style={homeStyles.stats}>Focus</Text>
        <Text
          style={[
            homeStyles.regular,
            score !== null && { color: focusBandColor(band.key, colors) },
          ]}
        >
          {score === null ? PLACEHOLDER : score}
        </Text>
      </View>
      <View>
        <Text style={homeStyles.stats}>Tasks</Text>
        <Text style={homeStyles.regular}>{tasks}</Text>
      </View>
    </View>
  );
};

export default PostCardStats;
