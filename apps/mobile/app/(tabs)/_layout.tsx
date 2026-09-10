import { NativeTabs } from "expo-router/unstable-native-tabs";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";

import { useTheme } from "@theme";

/**
 * `family` is typed as the union of the icon sets actually listed below, so a
 * typo in `icon` is a compile error against the right set. It used to be cast
 * to `any`, which turned every icon name into an unchecked string.
 */
type IconFamily = typeof AntDesign | typeof Feather | typeof FontAwesome5;

interface TabConfig {
  name: string;
  label: string;
  family: IconFamily;
  icon: string;
}

const TABS: TabConfig[] = [
  { name: "index", label: "Home", family: AntDesign, icon: "home" },
  { name: "study", label: "Study", family: Feather, icon: "book" },
  { name: "profile", label: "Profile", family: FontAwesome5, icon: "user" },
];

const TabsLayout = () => {
  const { colors } = useTheme();

  return (
    <NativeTabs
      tintColor={colors.primary}
      iconColor={{ default: colors.textMuted, selected: colors.primary }}
      minimizeBehavior="onScrollDown"
    >
      {TABS.map(({ name, label, family, icon }) => (
        <NativeTabs.Trigger key={name} name={name}>
          <NativeTabs.Trigger.Label selectedStyle={{ color: colors.primary }}>
            {label}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            src={<NativeTabs.Trigger.VectorIcon family={family} name={icon} />}
          />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
};

export default TabsLayout;
