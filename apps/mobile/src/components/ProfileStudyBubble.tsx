import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";

import { useTheme, useStyles, PROFILE_STUDY_ICON_SIZE } from "@theme";
import { formatDuration } from "@stdyapp/shared";
import type { Streak, StudyTotals } from "@data";

interface ProfileStudyBubbleProps {
  streak?: Streak;
  /**
   * Undefined both while loading AND when the profile belongs to someone else:
   * GET /api/sessions is self-only, so there is no figure to show for another
   * user rather than the viewer's own under someone else's name.
   */
  totals?: StudyTotals;
  /**
   * False on someone else's profile, where the totals are not "still loading"
   * but never coming - so their two figures are left out rather than held at an
   * em dash forever, which would read as a number that failed to load.
   */
  showTotals?: boolean;
}

interface Figure {
  icon: ComponentProps<typeof Feather>["name"];
  value: string;
  /** Shown only in the expanded state - see the panel below. */
  label: string;
  /** Lit rather than muted. Only the streak uses it, and only while it is live today. */
  isLit?: boolean;
}

/** An em dash until the figure arrives, rather than a zero that is also a real answer. */
const show = (value?: string): string => value ?? "—";

/**
 * The three study figures, in the order they read: how long a run, how many
 * sessions, how much time.
 *
 * Built here rather than in each renderer so the collapsed pill and the
 * expanded panel cannot disagree about what they contain or what order it is
 * in.
 */
export const studyFigures = (
  streak?: Streak,
  totals?: StudyTotals,
  showTotals = true,
): Figure[] => [
  {
    icon: "zap",
    value: show(streak && String(streak.currentCount)),
    label: "Day streak",
    // isActiveToday comes from the API: working it out here would use the
    // DEVICE's timezone and disagree with the server for several hours a day.
    isLit: streak?.isActiveToday,
  },
  ...(showTotals
    ? ([
        {
          icon: "check-circle",
          value: show(totals && String(totals.completed)),
          label: "Sessions",
        },
        {
          icon: "clock",
          value: show(totals && formatDuration(totals.minutes)),
          label: "Studied",
        },
      ] satisfies Figure[])
    : []),
];

/**
 * The study figures as a horizontal pill in the profile's top bar: an icon and
 * a value for each, no labels.
 *
 * Up in the bar rather than beside the avatar, which leaves the header to the
 * person - their face, name and bio - and puts the numbers where a glance at
 * the corner finds them, the way a phone's status bar holds its own figures.
 *
 * Tapping drops the labels down underneath as a small panel anchored to the
 * pill's right edge, so it opens out of where the finger is and covers nothing
 * the user was reading. Tapping either the pill or the panel closes it - there
 * is no full-screen backdrop, which inside a list header would have to live at
 * screen level the way ReportDialog does.
 */
const ProfileStudyBubble = ({
  streak,
  totals,
  showTotals = true,
}: ProfileStudyBubbleProps) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");
  const [isExpanded, setIsExpanded] = useState(false);

  const figures = studyFigures(streak, totals, showTotals);
  const toggle = () => setIsExpanded((current) => !current);
  const iconColor = (isLit?: boolean) => (isLit ? colors.warning : colors.textMuted);

  return (
    <View style={styles.studyPillAnchor}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        // Reads the figures out, because collapsed they are numbers with no
        // words next to them - an icon is not an accessible label.
        accessibilityLabel={`Study details: ${figures
          .map(({ value, label }) => `${value} ${label}`)
          .join(", ")}`}
        style={({ pressed }) => [
          styles.studyPill,
          isExpanded && styles.studyPillOpen,
          pressed && { opacity: 0.7 },
        ]}
      >
        {figures.map(({ icon, value, isLit, label }) => (
          <View key={label} style={styles.studyPillFigure}>
            <Feather name={icon} size={PROFILE_STUDY_ICON_SIZE} color={iconColor(isLit)} />
            <Text style={styles.studyPillValue}>{value}</Text>
          </View>
        ))}
      </Pressable>

      {isExpanded ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel="Hide study details"
          style={styles.studyPanel}
        >
          {figures.map(({ icon, value, label, isLit }) => (
            <View key={label} style={styles.studyPanelRow}>
              <Feather name={icon} size={PROFILE_STUDY_ICON_SIZE} color={iconColor(isLit)} />
              <Text style={styles.studyPillValue}>{value}</Text>
              <Text style={styles.studyPanelLabel}>{label}</Text>
            </View>
          ))}
        </Pressable>
      ) : null}
    </View>
  );
};

export default ProfileStudyBubble;
