import { NativeTabs } from "expo-router/unstable-native-tabs";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import AntDesign from "@expo/vector-icons/AntDesign";
import Feather from "@expo/vector-icons/Feather";
import useTheme from "@hooks/useTheme";

const TABS = [
  {
    name: "index",
    label: "Home",
    family: AntDesign,
    icon: "home",
  },
  {
    name: "study",
    label: "Study",
    family: Feather,
    icon: "book",
  },
  {
    name: "profile",
    label: "Profile",
    family: FontAwesome5,
    icon: "user",
  },
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
          {/* Text underneath the icon */}
          <NativeTabs.Trigger.Label selectedStyle={{ color: colors.primary }}>
            {label}
          </NativeTabs.Trigger.Label>

          {/* Icon */}
          <NativeTabs.Trigger.Icon
            src={<NativeTabs.Trigger.VectorIcon family={family as any} name={icon} />}
          />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
};

export default TabsLayout;
