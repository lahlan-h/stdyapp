import { View, Text, Pressable } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";

import { useTheme, useSettingsStyles, type ThemePreference } from "@theme";

interface SegmentConfig {
  preference: ThemePreference;
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
}

const SEGMENTS: SegmentConfig[] = [
  { preference: "light", label: "Light", icon: "sun" },
  { preference: "dark", label: "Dark", icon: "moon" },
  { preference: "system", label: "System", icon: "smartphone" },
];

/**
 * Picks the theme, including "System".
 *
 * Three states rather than a Switch on purpose. ThemeProvider has always modelled
 * "no override, follow the OS" as a distinct state, but the only control that
 * existed was a boolean toggle - so the first tap left that state and nothing
 * could return to it. A two-way switch cannot express three options, so the
 * control is the segmented group and not the row's trailing slot.
 */
const ThemeSegmentedControl = () => {
  const { colors, themePreference, setThemePreference } = useTheme();
  const settingsStyles = useSettingsStyles();

  return (
    <View style={settingsStyles.segmentGroup} accessibilityRole="radiogroup">
      {SEGMENTS.map(({ preference, label, icon }) => {
        const isSelected = themePreference === preference;

        return (
          <Pressable
            key={preference}
            onPress={() => setThemePreference(preference)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={`${label} theme`}
            style={[
              settingsStyles.segment,
              isSelected && settingsStyles.segmentSelected,
            ]}
          >
            <Feather
              name={icon}
              size={16}
              // Matches segmentLabelSelected: the selected pill is colors.primary
              // in both themes, so its contents are fixed white rather than
              // flipping with the palette.
              color={isSelected ? "#ffffff" : colors.textMuted}
            />
            <Text
              style={[
                settingsStyles.segmentLabel,
                isSelected && settingsStyles.segmentLabelSelected,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export default ThemeSegmentedControl;
