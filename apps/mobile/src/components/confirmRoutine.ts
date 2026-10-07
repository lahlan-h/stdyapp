import { Alert, Platform } from "react-native";

/**
 * Confirmations for the two routine actions that cannot be taken back.
 *
 * The web branch is here for confirmSignOut's reason: react-native-web's
 * Alert.alert does nothing, so without it the buttons would look dead in the
 * browser.
 */
const confirm = (
  title: string,
  message: string,
  actionLabel: string,
  onConfirm: () => void,
): void => {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: actionLabel, style: "destructive", onPress: onConfirm },
  ]);
};

/** Every task in the routine goes with it. */
export const confirmDeleteRoutine = (title: string, onConfirm: () => void): void =>
  confirm(
    "Delete routine?",
    `"${title}" and all its tasks will be deleted. This cannot be undone.`,
    "Delete",
    onConfirm,
  );

/** Confirmed because one tap would wipe a whole list of ticks. */
export const confirmResetRoutine = (title: string, onConfirm: () => void): void =>
  confirm(
    "Start again?",
    `Every task in "${title}" will be unticked.`,
    "Start again",
    onConfirm,
  );
