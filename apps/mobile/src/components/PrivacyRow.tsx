import { useEffect, useState } from "react";
import { Alert, Platform, Switch } from "react-native";

import { useTheme } from "@theme";
import { useProfile } from "@data";

import SettingsRow from "./SettingsRow";

const GO_PUBLIC_TITLE = "Make your account public?";
const GO_PUBLIC_MESSAGE =
  "Anyone will be able to see your posts and study activity, and any follow requests still waiting will be accepted.";

/**
 * Asks before going public - the one direction of this switch with a side
 * effect someone might not expect: everyone still waiting becomes a follower.
 * Going private needs no warning; it only takes things away from strangers.
 *
 * The web branch is confirmSignOut's: Alert.alert is a no-op on
 * react-native-web.
 */
const confirmGoPublic = (onConfirm: () => void): void => {
  if (Platform.OS === "web") {
    if (window.confirm(`${GO_PUBLIC_TITLE} ${GO_PUBLIC_MESSAGE}`)) onConfirm();
    return;
  }

  Alert.alert(GO_PUBLIC_TITLE, GO_PUBLIC_MESSAGE, [
    { text: "Cancel", style: "cancel" },
    { text: "Make public", onPress: onConfirm },
  ]);
};

/**
 * The Privacy row in Settings: a switch for isPrivate.
 *
 * On, only approved followers see the account's posts and activity, and
 * following it becomes a request it accepts - from the notification, or from
 * the requester's profile. Off, everyone can see it again.
 *
 * OPTIMISTIC: the switch moves under the finger and moves back if the save
 * fails, with the reason in the row's own description. useProfile's save is
 * the write, so the PATCH goes to the same place every other profile edit does.
 */
const PrivacyRow = () => {
  const { colors } = useTheme();
  const { profile, save, saveError, resetSaveError } = useProfile();

  // Undefined until the profile has loaded - a switch showing "off" before then
  // would invite a tap that might mean the opposite.
  const [isPrivate, setIsPrivate] = useState<boolean | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile && !isSaving) setIsPrivate(profile.isPrivate);
  }, [profile, isSaving]);

  const apply = async (next: boolean) => {
    resetSaveError();
    setIsPrivate(next);
    setIsSaving(true);
    const saved = await save({ isPrivate: next });
    if (!saved) setIsPrivate(!next);
    setIsSaving(false);
  };

  const onValueChange = (next: boolean) => {
    if (next) void apply(true);
    else confirmGoPublic(() => void apply(false));
  };

  return (
    // A failed save takes the description's place, so the reason sits on the
    // row it is about rather than somewhere else on the screen.
    <SettingsRow
      icon="lock"
      label="Private account"
      description={saveError ?? "Only followers you approve see your posts and activity"}
      right={
        <Switch
          value={isPrivate ?? false}
          onValueChange={onValueChange}
          disabled={isPrivate === undefined || isSaving}
          trackColor={{ false: colors.border, true: colors.primary }}
          ios_backgroundColor={colors.border}
          accessibilityLabel="Private account"
        />
      }
    />
  );
};

export default PrivacyRow;
