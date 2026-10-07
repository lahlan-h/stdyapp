import { View, Text, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import type { ComponentProps } from "react";
import type { BottomTabBarProps } from "expo-router/js-tabs";

import { useTheme, useTabBarStyles, TAB_ICON_SIZE } from "@theme";

interface TabBase {
  name: string;
  label: string;
}

/**
 * `family` is a literal, not the icon component itself.
 *
 * As a union of components it could only ever type `icon` as a bare string -
 * which is how a typo used to survive to runtime as a blank space on the bar.
 * Discriminating on a literal lets each arm check `icon` against that family's
 * own name union instead.
 */
type TabConfig =
  | (TabBase & {
      family: "AntDesign";
      icon: ComponentProps<typeof AntDesign>["name"];
    })
  | (TabBase & {
      family: "Feather";
      icon: ComponentProps<typeof Feather>["name"];
    })
  | (TabBase & {
      family: "FontAwesome5";
      icon: ComponentProps<typeof FontAwesome5>["name"];
    });

/**
 * Five tabs, in bar order. The add-post circle that used to sit in the middle
 * now lives on the Feed itself, which freed the slot Analytics takes.
 *
 * The Feed is still the `index` route - renaming the file would change every
 * deep link to "/" - so only its label changed.
 */
export const TABS: TabConfig[] = [
  { name: "index", label: "Feed", family: "AntDesign", icon: "home" },
  { name: "study", label: "Study", family: "Feather", icon: "book" },
  { name: "analytics", label: "Analytics", family: "Feather", icon: "bar-chart-2" },
  { name: "profile", label: "Profile", family: "FontAwesome5", icon: "user" },
  { name: "settings", label: "Settings", family: "Feather", icon: "settings" },
];

const renderIcon = (tab: TabConfig, color: string) => {
  switch (tab.family) {
    case "AntDesign":
      return <AntDesign name={tab.icon} size={TAB_ICON_SIZE} color={color} />;
    case "Feather":
      return <Feather name={tab.icon} size={TAB_ICON_SIZE} color={color} />;
    case "FontAwesome5":
      return <FontAwesome5 name={tab.icon} size={TAB_ICON_SIZE} color={color} />;
  }
};

/**
 * The bottom bar, drawn in JS rather than by the OS.
 *
 * It was moved off `NativeTabs` to host the add-post circle in its centre.
 * The circle has since moved to the Feed, but the JS bar stays: it carries the
 * app's own blur, colours and type, and switching back would be churn for no
 * gain to the user.
 *
 * Rendering is driven by TABS, not by `state.routes`: the router decides its
 * own order, and the bar's order is a design decision.
 */
const TabBar = ({ state, navigation, insets }: BottomTabBarProps) => {
  const { colors, isDarkMode } = useTheme();
  const tabBarStyles = useTabBarStyles();

  const renderTab = (tab: TabConfig) => {
    const route = state.routes.find((candidate) => candidate.name === tab.name);
    if (!route) return null;

    const isFocused = state.routes[state.index]?.key === route.key;
    const color = isFocused ? colors.primary : colors.textMuted;

    const onPress = () => {
      // Emitted so a screen can intercept its own tab press - scroll-to-top is
      // the usual reason - before the navigation happens.
      const event = navigation.emit({
        type: "tabPress",
        target: route.key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={tab.name}
        onPress={onPress}
        style={({ pressed }) => [
          tabBarStyles.tab,
          pressed && { opacity: 0.6 },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={tab.label}
      >
        {renderIcon(tab, color)}
        <Text
          style={[tabBarStyles.label, isFocused && tabBarStyles.labelSelected]}
        >
          {tab.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[tabBarStyles.container, { paddingBottom: insets.bottom }]}>
      <BlurView
        intensity={40}
        tint={isDarkMode ? "dark" : "light"}
        style={tabBarStyles.surface}
      />

      <View style={tabBarStyles.row}>{TABS.map(renderTab)}</View>
    </View>
  );
};

export default TabBar;
