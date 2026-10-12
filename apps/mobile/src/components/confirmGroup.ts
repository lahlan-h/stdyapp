import { Alert, Platform } from "react-native";

/**
 * Confirmations for the group actions that cannot be taken back - leaving,
 * deleting, removing someone, handing over ownership, retiring a join code.
 *
 * The web branch is here for confirmRoutine's reason: react-native-web's
 * Alert.alert does nothing, so without it these buttons look dead in the
 * browser. Two buttons per alert on native, because Android shows at most
 * three.
 */
export const confirmGroupAction = (
  title: string,
  message: string,
  actionLabel: string,
  onConfirm: () => void,
  { destructive = true }: { destructive?: boolean } = {},
): void => {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: actionLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
};
