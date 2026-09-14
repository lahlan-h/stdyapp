import { View, Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps, ReactNode } from "react";

import { useTheme, useSettingsStyles, ROW_ICON_SIZE } from "@theme";

/**
 * Typed against Feather's own name union, so a typo in `icon` is a compile
 * error rather than a blank space on the screen at runtime.
 */
type FeatherIconName = ComponentProps<typeof Feather>["name"];

interface SettingsRowProps {
  icon: FeatherIconName;
  label: string;
  description?: string;
  /** Trailing content - a Switch, a chevron, a value. */
  right?: ReactNode;
  onPress?: () => void;
  /** Renders the label and icon in the danger colour. Does not imply disabled. */
  isDestructive?: boolean;
  /**
   * Not yet built. Dims the row, blocks presses, and shows a "Soon" badge, so a
   * placeholder is honest to the user instead of looking like a broken control.
   */
  isPlaceholder?: boolean;
  /** Draws the divider above the row. Set false on a section's first row. */
  isFirst?: boolean;
}

const SettingsRow = ({
  icon,
  label,
  description,
  right,
  onPress,
  isDestructive = false,
  isPlaceholder = false,
  isFirst = false,
}: SettingsRowProps) => {
  const { colors } = useTheme();
  const settingsStyles = useSettingsStyles();

  const iconColor = isDestructive ? colors.danger : colors.textMuted;

  const content = (
    <View
      style={[
        settingsStyles.row,
        !isFirst && settingsStyles.rowDivider,
        isPlaceholder && settingsStyles.rowDisabled,
      ]}
    >
      <View style={settingsStyles.rowIconBox}>
        <Feather name={icon} size={ROW_ICON_SIZE} color={iconColor} />
      </View>

      <View style={settingsStyles.rowText}>
        <Text
          style={[
            settingsStyles.rowLabel,
            isDestructive && settingsStyles.rowLabelDanger,
          ]}
        >
          {label}
        </Text>
        {description && (
          <Text style={settingsStyles.rowDescription}>{description}</Text>
        )}
      </View>

      {isPlaceholder ? (
        <View style={settingsStyles.badge}>
          <Text style={settingsStyles.badgeText}>SOON</Text>
        </View>
      ) : (
        right
      )}
    </View>
  );

  // A row with no action stays a plain View: wrapping it in a Pressable would
  // announce it as a button to a screen reader and give it press feedback it
  // does nothing with.
  if (!onPress || isPlaceholder) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Only the ripple/opacity is suppressed while held; the row itself keeps
      // its own background from the section card behind it.
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      {content}
    </Pressable>
  );
};

export default SettingsRow;
