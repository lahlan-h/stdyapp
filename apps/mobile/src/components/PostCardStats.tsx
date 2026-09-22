import { View, Text } from "react-native";

import { useStyles } from "@theme";
import { formatDuration } from "@stdyapp/shared";
import type { FeedSession } from "@data";

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
 * Neither value is fully wired yet:
 *
 * Time is real whenever a session is linked AND finished. A running session has
 * no duration, and zero would be a lie that corrects itself the moment it ends,
 * so it says so instead. Linking is what the compose screen still lacks.
 *
 * Goals Reached is ALWAYS a placeholder, and not for want of plumbing: a Goal is
 * one row per user per period and is never attached to a session, so there is
 * nothing to count. Whether a session crossed a goal is worked out inside
 * endSession to decide on a notification and then thrown away. Showing this per
 * post needs a column on Session that endSession writes - until then any number
 * here would be fiction.
 */
const PostCardStats = ({ session }: PostCardStatsProps) => {
  const homeStyles = useStyles("home");

  const time = !session
    ? PLACEHOLDER
    : session.durationMinutes === null
      ? "In progress"
      : formatDuration(session.durationMinutes);

  return (
    <View style={homeStyles.statsContainer}>
      <View>
        <Text style={homeStyles.stats}>Time</Text>
        <Text style={homeStyles.regular}>{time}</Text>
      </View>
      <View>
        <Text style={homeStyles.stats}>Goals Reached</Text>
        <Text style={homeStyles.regular}>{PLACEHOLDER}</Text>
      </View>
    </View>
  );
};

export default PostCardStats;
