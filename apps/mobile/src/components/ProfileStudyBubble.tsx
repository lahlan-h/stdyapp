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
}

interface Figure {
  icon: ComponentProps<typeof Feather>["name"];
  value: string;
  /** Shown only in the expanded state - see ProfileStudyPanel. */
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
 * Built here rather than in each renderer so the collapsed bubble and the
 * expanded panel cannot disagree about what they contain or what order it is
 * in.
 */
export const studyFigures = (
  streak?: Streak,
  totals?: StudyTotals,
): Figure[] => [
  {
    icon: "zap",
    value: show(streak && String(streak.currentCount)),
    label: "Day streak",
    // isActiveToday comes from the API: working it out here would use the
    // DEVICE's timezone and disagree with the server for several hours a day.
    isLit: streak?.isActiveToday,
  },
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
];

/**
 * The study figures beside the avatar, collapsed to icons and values.
 *
 * Dropping the labels is what keeps it narrow enough to sit next to the avatar
 * without pushing it off centre. Tapping adds them back: the expanded panel is
 * drawn OVER the header from the same anchor rather than displacing it, so
 * nothing below moves and the panel grows out of where the user tapped.
 *
 * The panel reuses this component's own figure block and matches its vertical
 * metrics, so opening it grows the card to the RIGHT and leaves every icon and
 * value exactly where it was. Only the labels are new.
 *
 * Tapping either state toggles, so the panel is its own way out - there is no
 * full-screen backdrop to catch a tap elsewhere, which inside a list header
 * would have to live at screen level the way ReportDialog does.
 */
const ProfileStudyBubble = ({ streak, totals }: ProfileStudyBubbleProps) => {
  const { colors } = useTheme();
  const styles = useStyles("profile");
  const [isExpanded, setIsExpanded] = useState(false);

  const figures = studyFigures(streak, totals);
  const toggle = () => setIsExpanded((current) => !current);

  if (isExpanded) {
    return (
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel="Hide study details"
        style={styles.studyPanel}
      >
        {figures.map(({ icon, value, label, isLit }) => (
          <View key={label} style={styles.studyPanelRow}>
            {/*
              The SAME figure block the collapsed bubble draws, deliberately -
              icon stacked over value, identical styles. Laying the three out in
              a line instead would put every value on a different baseline than
              the collapsed state, so the numbers would visibly jump on tap.
            */}
            <View style={styles.studyBubbleFigure}>
              <Feather
                name={icon}
                size={PROFILE_STUDY_ICON_SIZE}
                color={isLit ? colors.warning : colors.textMuted}
              />
              <Text style={styles.studyBubbleValue}>{value}</Text>
            </View>
            <Text style={styles.studyPanelLabel}>{label}</Text>
          </View>
        ))}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      // Reads the figures out, because collapsed they are numbers with no
      // words next to them - an icon is not an accessible label.
      accessibilityLabel={`Study details: ${figures
        .map(({ value, label }) => `${value} ${label}`)
        .join(", ")}`}
      style={styles.studyBubble}
    >
      {figures.map(({ icon, value, isLit, label }) => (
        <View key={label} style={styles.studyBubbleFigure}>
          <Feather
            name={icon}
            size={PROFILE_STUDY_ICON_SIZE}
            color={isLit ? colors.warning : colors.textMuted}
          />
          <Text style={styles.studyBubbleValue}>{value}</Text>
        </View>
      ))}
    </Pressable>
  );
};

export default ProfileStudyBubble;
