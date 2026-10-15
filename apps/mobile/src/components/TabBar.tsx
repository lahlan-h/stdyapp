import { View, Text, Pressable } from "react-native";
import { BlurView } from "expo-blur";
import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import type { ComponentProps } from "react";
import type { BottomTabBarProps } from "expo-router/js-tabs";

import { useTheme, useTabBarStyles, TAB_ICON_SIZE } from "@theme";
import { useIsSessionRunning } from "@data";

import SessionBar from "./SessionBar";

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
 * The tabs, in bar order. Analytics and Settings were tabs once and are pushed
 * screens now - Analytics from the Study tab, Settings from a gear on the
 * profile.
 *
 * The feed is labelled Home, as the design names it. It is still the `index`
 * route - renaming the file would change every deep link to "/" - so only its
 * label changed.
 */
export const TABS: TabConfig[] = [
  { name: "index", label: "Home", family: "AntDesign", icon: "home" },
  { name: "study", label: "Study", family: "Feather", icon: "book" },
  { name: "profile", label: "Profile", family: "FontAwesome5", icon: "user" },
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
 *
 * A floating pill rather than a full-width strip: three tabs do not need the
 * width, and content stays visible either side of it.
 */
const TabBar = ({ state, navigation, insets }: BottomTabBarProps) => {
  const { colors, isDarkMode } = useTheme();
  const tabBarStyles = useTabBarStyles();
  const sessionRunning = useIsSessionRunning();

  // Not on Study: that tab IS the session, with its clock and End button
  // already on screen.
  const showSessionBar =
    sessionRunning && state.routes[state.index]?.name !== "study";

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
          isFocused && tabBarStyles.tabSelected,
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
    // box-none: the container spans the screen so the pill can centre itself,
    // but only the pill may catch touches - either side of it is content, and
    // has to stay tappable.
    <View
      style={[tabBarStyles.container, { paddingBottom: insets.bottom }]}
      pointerEvents="box-none"
    >
      {showSessionBar ? <SessionBar onExpand={() => navigation.navigate("study")} /> : null}

      <View style={tabBarStyles.pill}>
        <BlurView
          intensity={40}
          tint={isDarkMode ? "dark" : "light"}
          style={tabBarStyles.surface}
        />
        {TABS.map(renderTab)}
      </View>
    </View>
  );
};

export default TabBar;
