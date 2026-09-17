import { View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { router } from "expo-router";
import type { ComponentProps } from "react";
import type { BottomTabBarProps } from "expo-router/js-tabs";

import {
  useTheme,
  useTabBarStyles,
  TAB_ICON_SIZE,
  FAB_ICON_SIZE,
} from "@theme";

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

export const TABS: TabConfig[] = [
  { name: "index", label: "Home", family: "AntDesign", icon: "home" },
  { name: "study", label: "Study", family: "Feather", icon: "book" },
  { name: "profile", label: "Profile", family: "FontAwesome5", icon: "user" },
  { name: "settings", label: "Settings", family: "Feather", icon: "settings" },
];

/** Where the circle goes: after Home and Study, before Profile and Settings. */
const FAB_INDEX = 2;

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
 * This used to be `NativeTabs`, which renders a real UITabBarController /
 * BottomNavigationView. That bar cannot host the add-post circle - it takes
 * styling tokens only, with no way to place a React view between its icons -
 * so it was replaced wholesale. The costs of the swap were iOS 26's
 * scroll-to-minimize and the native scroll-edge transparency, neither of which
 * has a JS equivalent.
 *
 * Rendering is driven by TABS, not by `state.routes`: the router decides its
 * own order, and the circle has to land dead centre.
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

      <View style={tabBarStyles.row}>
        {TABS.slice(0, FAB_INDEX).map(renderTab)}
        {/* The column the circle lines up with. It holds nothing: laid out in
            the row, the circle would drive the row's height and inflate the
            bar. */}
        <View style={tabBarStyles.tab} />
        {TABS.slice(FAB_INDEX).map(renderTab)}
      </View>

      {/*
        box-none, not none: the wrapper spans the full width so the circle can
        centre itself, and catching touches across it would swallow presses
        meant for the tabs either side.
      */}
      <View style={tabBarStyles.fabWrap} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [
            tabBarStyles.fabRing,
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => router.push("/new-post")}
          accessibilityRole="button"
          accessibilityLabel="New post"
        >
          <LinearGradient
            colors={colors.gradients.primary}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={tabBarStyles.fab}
          >
            {/* Always the light palette's surface, never colors.text: this sits
                on gradients.primary, which is the same mid blue in both
                themes. */}
            <Feather name="plus" size={FAB_ICON_SIZE} color="#ffffff" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
};

export default TabBar;
