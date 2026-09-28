import { Tabs } from "expo-router/js-tabs";

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
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      {TABS.map(({ name }) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
};

export default TabsLayout;
