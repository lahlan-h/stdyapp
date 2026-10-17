import { Platform, View } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";

import { useTheme, useTabBarStyles, FALLBACK_TAB_BAR_HEIGHT } from "@theme";
import { FocusSessionProvider, useIsSessionRunning, useNotificationStream } from "@data";

import SessionBar, { SUPPORTS_BOTTOM_ACCESSORY } from "@components/SessionBar";
import SessionAccessory from "@components/SessionAccessory";

/**
 * The native tab bar: Liquid Glass on iOS 26, Material on Android.
 *
 * It was swapped for a JS bar to make room for an add-post circle the native
 * bar cannot host. The circle is gone - posting happens when a session ends -
 * so the bar is the system's own again.
 *
 * Icons are SF Symbols on iOS, filled when selected the way system apps do it,
 * and the same vector icons as before on Android.
 */
const TABS = [
  {
    name: "index",
    label: "Home",
    sf: { default: "house", selected: "house.fill" },
    android: <NativeTabs.Trigger.VectorIcon family={AntDesign} name="home" />,
  },
  {
    name: "study",
    label: "Study",
    sf: { default: "book", selected: "book.fill" },
    android: <NativeTabs.Trigger.VectorIcon family={Feather} name="book" />,
  },
  {
    name: "profile",
    label: "Profile",
    sf: { default: "person", selected: "person.fill" },
    android: <NativeTabs.Trigger.VectorIcon family={FontAwesome5} name="user" />,
  },
] as const;

/**
 * The bar itself, and the running session above it.
 *
 * Its own component because it reads the session, so it has to sit INSIDE
 * FocusSessionProvider rather than in the layout that renders the provider.
 */
const TabsNavigator = () => {
  const { colors } = useTheme();
  const tabBarStyles = useTabBarStyles();
  const insets = useSafeAreaInsets();
  const sessionRunning = useIsSessionRunning();
  const pathname = usePathname();

  // Not on Study: that tab IS the session, with its clock and End button
  // already on screen.
  const showSessionBar = sessionRunning && pathname !== "/study";
  const openStudy = () => router.navigate("/study");

  return (
    <>
      {/* "never", not iOS 26's shrink-on-scroll: a bar that collapses to one
          icon mid-feed hides where the other tabs are, and the bar is how this
          app gets around. It stays put at full size on every tab. */}
      <NativeTabs tintColor={colors.primary} minimizeBehavior="never">
        {/* iOS 26's slot above the bar - Apple Music's mini player, in the
            bar's own glass. Where it does not exist, the overlay below. */}
        {showSessionBar && SUPPORTS_BOTTOM_ACCESSORY ? (
          <NativeTabs.BottomAccessory>
            <SessionAccessory onExpand={openStudy} />
          </NativeTabs.BottomAccessory>
        ) : null}
        {TABS.map(({ name, label, sf, android }) => (
          // iOS: no automatic content insets - they cleared the bar on some
          // tabs and not others. Each tab pads itself instead; see
          // useTabBarClearance. Android keeps its own, which is consistent.
          <NativeTabs.Trigger
            key={name}
            name={name}
            disableAutomaticContentInsets={Platform.OS === "ios"}
          >
            <NativeTabs.Trigger.Label>{label}</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={sf} src={android} />
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>

      {/* Android and iOS before 26 have no accessory slot, so the floating
          bar sits over the tab bar instead - box-none so the strip either
          side of it stays tappable. */}
      {showSessionBar && !SUPPORTS_BOTTOM_ACCESSORY ? (
        <View
          style={[tabBarStyles.sessionBarOverlay, { bottom: insets.bottom + FALLBACK_TAB_BAR_HEIGHT }]}
          pointerEvents="box-none"
        >
          <SessionBar onExpand={openStudy} />
        </View>
      ) : null}
    </>
  );
};

const TabsLayout = () => {
  // The real-time notification connection lives here, the one place that is
  // mounted for exactly as long as someone is signed in: the root guard only
  // renders (tabs) for a session. Every tab then shares one socket, so the
  // badge on Home is already right when someone comes back to it.
  useNotificationStream();

  // The study session lives here for the same reason: the Study tab runs it,
  // and the bar above the tabs shows it on every other tab.
  return (
    <FocusSessionProvider>
      <TabsNavigator />
    </FocusSessionProvider>
  );
};

export default TabsLayout;
