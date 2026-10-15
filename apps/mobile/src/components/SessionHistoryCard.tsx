import { Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, SESSION_HISTORY_ICON_SIZE } from "@theme";
import type { SessionHistoryItem } from "@data";

import RatingStars from "./RatingStars";
import { focusBand, focusBandColor } from "./focusBand";
import { NONE, formatMinutes, formatSeconds, formatTime } from "./sessionFormat";

/**
 * One past session in the history list: when, how long, the focus estimate,
 * and the three things that explain it - tasks, distractions, the user's own
 * rating. Tapping opens the recap-style detail.
 */
const SessionHistoryCard = ({
  session,
  onPress,
}: {
  session: SessionHistoryItem;
  onPress: () => void;
}) => {
  const { colors } = useTheme();
  const styles = useStyles("sessionHistory");

  const band = focusBand(session.focusScore);
  const bandColor = focusBandColor(band.key, colors);

  const duration =
    session.status === "ended" ? formatMinutes(session.durationMinutes) : NONE;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Session at ${formatTime(session.startedAt)}, ${duration}, focus estimate ${
        session.focusScore ?? "none"
      }`}
      style={({ pressed }) => [styles.card, pressed ? { opacity: 0.7 } : undefined]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.cardTime}>{formatTime(session.startedAt)}</Text>
        <Text style={styles.cardDuration}>{duration}</Text>

        {/* Estimate badge: band label and the number, never 0 for "none". */}
        <View style={styles.badge}>
          <View style={[styles.badgeDot, { backgroundColor: bandColor }]} />
          <Text style={[styles.badgeText, { color: bandColor }]}>
            {band.label}
            {session.focusScore !== null ? ` · ${session.focusScore}` : ""}
          </Text>
        </View>
      </View>

      <View style={styles.statRow}>
        {session.tasksTotal > 0 ? (
          <View style={styles.stat}>
            <Feather name="check-square" size={SESSION_HISTORY_ICON_SIZE} color={colors.primary} />
            <Text style={styles.statText}>
              {session.tasksCompleted}/{session.tasksTotal}
            </Text>
          </View>
        ) : null}

        <View style={styles.stat}>
          <Feather name="zap-off" size={SESSION_HISTORY_ICON_SIZE} color={colors.danger} />
          <Text style={styles.statText}>
            {session.interruptionCount}
            {session.awaySeconds > 0 ? ` · ${formatSeconds(session.awaySeconds)}` : ""}
          </Text>
        </View>

        {session.selfRating !== null ? <RatingStars value={session.selfRating} /> : null}

        {session.isGroup ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>Group</Text>
          </View>
        ) : null}

        {session.status === "active" ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>In progress</Text>
          </View>
        ) : null}

        {session.status === "abandoned" ? (
          <View style={[styles.chip, styles.chipDanger]}>
            <Text style={[styles.chipText, styles.chipDangerText]}>Abandoned</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};

export default SessionHistoryCard;
