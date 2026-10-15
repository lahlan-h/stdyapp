import { confirmGroupAction } from "./confirmGroup";

/**
 * Asks before a study session is thrown away - the session bar's bin, and the
 * composer's Discard.
 *
 * Built on confirmGroupAction for its web branch: react-native-web's
 * Alert.alert does nothing, and a bin that silently does nothing in the browser
 * looks broken. That helper's prompt is generic despite its name.
 */
export const confirmDiscardSession = (onConfirm: () => void): void =>
  confirmGroupAction(
    "Discard this session?",
    "It is deleted, and the time won't count toward your streak or analytics.",
    "Discard",
    onConfirm,
  );
