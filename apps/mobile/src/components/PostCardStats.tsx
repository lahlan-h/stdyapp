import { View, Text } from "react-native";

import { useHomeStyles } from "@theme";
import { formatDuration } from "@stdyapp/shared";
import type { FeedSession } from "@data";

interface PostCardStatsProps {
  session: FeedSession;
}

/**
 * The linked session's numbers.
 *
 * Rendered only when a post actually has a session - PostCard decides that -
 * because the alternative is a row of zeroes under every plain status post.
 *
 * This used to read "Goals Hit", from a count the old backend let the client
 * type in. Goals are one row per user per period, never attached to a session,
 * so that number was never derivable and is now focus points: minutes studied,
 * less 10 for each interruption over 20 minutes, as endSession computes it.
 */
const PostCardStats = ({ session }: PostCardStatsProps) => {
  const homeStyles = useHomeStyles();

  return (
    <View style={homeStyles.statsContainer}>
      <View>
        <Text style={homeStyles.stats}>Time</Text>
        <Text style={homeStyles.regular}>
          {/* Null means the session has not ended. Zero would be a lie that
              corrects itself the moment it does. */}
          {session.durationMinutes === null
            ? "In progress"
            : formatDuration(session.durationMinutes)}
        </Text>
      </View>
      <View>
        <Text style={homeStyles.stats}>Focus</Text>
        <Text style={homeStyles.regular}>
          {session.focusPoints === 1 ? "1 pt" : `${session.focusPoints} pts`}
        </Text>
      </View>
    </View>
  );
};

export default PostCardStats;
