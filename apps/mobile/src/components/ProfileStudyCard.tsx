import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, PROFILE_STUDY_ICON_SIZE } from "@theme";
import { formatDuration } from "@stdyapp/shared";
import type { Streak, StudyTotals } from "@data";

interface ProfileStudyCardProps {
  streak?: Streak;
  /**
   * Undefined both while loading AND when the profile belongs to someone else:
   * GET /api/sessions is self-only, so there is no figure to show for another
   * user. The card drops the column rather than showing the viewer's own totals
   * under someone else's name.
   */
  totals?: StudyTotals;
}

/** An em dash until the figure arrives, rather than a zero that is also a real answer. */
const show = (value?: string): string => value ?? "—";

/** Streak and study totals, as one card under the stats row. */
const ProfileStudyCard = ({ streak, totals }: ProfileStudyCardProps) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");

  return (
    <LinearGradient
      style={styles.studyCard}
      colors={colors.gradients.surface}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
    >
      <View style={styles.studyFigure}>
        <View style={styles.studyValueRow}>
          <Feather
            name="zap"
            size={PROFILE_STUDY_ICON_SIZE}
            // Lit only while the streak is alive TODAY. isActiveToday comes
            // from the API because working it out here would use the device's
            // timezone and disagree with the server for several hours a day.
            color={streak?.isActiveToday ? colors.warning : colors.textMuted}
          />
          <Text style={styles.studyValue}>
            {show(streak && String(streak.currentCount))}
          </Text>
        </View>
        <Text style={styles.studyLabel}>Day streak</Text>
      </View>

      <View style={styles.studyDivider} />

      <View style={styles.studyFigure}>
        <View style={styles.studyValueRow}>
          <Feather
            name="check-circle"
            size={PROFILE_STUDY_ICON_SIZE}
            color={colors.textMuted}
          />
          <Text style={styles.studyValue}>
            {show(totals && String(totals.completed))}
          </Text>
        </View>
        <Text style={styles.studyLabel}>Sessions</Text>
      </View>

      <View style={styles.studyDivider} />

      <View style={styles.studyFigure}>
        <View style={styles.studyValueRow}>
          <Feather
            name="clock"
            size={PROFILE_STUDY_ICON_SIZE}
            color={colors.textMuted}
          />
          <Text style={styles.studyValue}>
            {show(totals && formatDuration(totals.minutes))}
          </Text>
        </View>
        <Text style={styles.studyLabel}>Studied</Text>
      </View>
    </LinearGradient>
  );
};

export default ProfileStudyCard;
