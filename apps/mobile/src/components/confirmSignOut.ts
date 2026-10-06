import { Alert, Platform } from "react-native";

import { logout } from "@data";

/**
 * Asks, then signs out.
 *
 * Confirmed first because it is one tap from the bottom of a scroll and undoing
 * it means signing in again.
 *
 * No navigation here: logout flips the session and the root layout's guard
 * returns to login. It also forgets a remembered session, so the next launch
 * starts at login too.
 *
 * Shared by settings and the profile rather than written out at each. The web
 * branch is the reason: react-native-web's Alert.alert is a NO-OP, so a copy
 * that forgot it would look like a dead button in the browser - and would look
 * fine on every simulator anyone tested it on.
 */
export const confirmSignOut = (): void => {
  if (Platform.OS === "web") {
    if (window.confirm("Sign out? You will need to sign in again to use stdy.")) {
      void logout();
    }
    return;
  }

  Alert.alert("Sign out?", "You will need to sign in again to use stdy.", [
    { text: "Cancel", style: "cancel" },
    { text: "Sign out", style: "destructive", onPress: () => void logout() },
  ]);
};
