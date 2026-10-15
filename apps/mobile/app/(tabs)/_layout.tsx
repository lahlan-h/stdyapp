import { Tabs } from "expo-router/js-tabs";

import { FocusSessionProvider, useNotificationStream } from "@data";

import TabBar, { TABS } from "@components/TabBar";

/**
 * The JS tab navigator, not `NativeTabs`.
 *
 * The native bar renders a real UITabBarController / BottomNavigationView and
 * takes styling tokens only - there is no way to place the add-post circle
 * between its icons, so the design could not be built on it. TabBar draws the
 * bar instead; everything about which screens exist stays file-based.
 *
 * `headerShown: false` is load-bearing: NativeTabs never had a header, but this
 * navigator shows one by default, and without this every screen grows one.
 */
const TabsLayout = () => {
  // The real-time notification connection lives here, the one place that is
  // mounted for exactly as long as someone is signed in: the root guard only
  // renders (tabs) for a session. Every tab then shares one socket, so the
  // badge on Home is already right when someone comes back to it.
  useNotificationStream();

  // The study session lives here for the same reason: the Study tab runs it,
  // and the tab bar shows it on every other tab.
  return (
    <FocusSessionProvider>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <TabBar {...props} />}
      >
        {TABS.map(({ name }) => (
          <Tabs.Screen key={name} name={name} />
        ))}
      </Tabs>
    </FocusSessionProvider>
  );
};

export default TabsLayout;
