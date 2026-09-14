import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";

import { useTheme, useSettingsStyles } from "@theme";

interface SettingsSectionProps {
  title: string;
  /**
   * Caveat shown under the card. Use it where the rows above do not yet do what
   * their labels imply - a stored preference that nothing acts on should say so
   * on the screen, not only in a comment.
   */
  footnote?: string;
  children: ReactNode;
}

/**
 * A titled group of settings rows, drawn as one card.
 *
 * Uses the same surface gradient and border treatment as PostCard so the two
 * screens read as the same app. The rows inside supply their own dividers - see
 * SettingsRow's `isFirst` - rather than this component injecting separators
 * between children, which would mean walking and cloning them.
 */
const SettingsSection = ({ title, footnote, children }: SettingsSectionProps) => {
  const { colors } = useTheme();
  const settingsStyles = useSettingsStyles();

  return (
    <View style={settingsStyles.section}>
      <Text style={settingsStyles.sectionTitle}>{title}</Text>
      <LinearGradient
        style={settingsStyles.sectionCard}
        colors={colors.gradients.surface}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        {children}
      </LinearGradient>
      {footnote && <Text style={settingsStyles.sectionFootnote}>{footnote}</Text>}
    </View>
  );
};

export default SettingsSection;
