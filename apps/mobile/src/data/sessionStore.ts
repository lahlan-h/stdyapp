import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Where a remembered session's refresh token lives between launches.
 *
 * Only the REFRESH token is ever written. The access token lasts 15 minutes,
 * so keeping it would buy nothing: a restored session presents the refresh
 * token and gets a fresh pair.
 *
 * Native: the Keychain / Keystore via expo-secure-store - encrypted at rest and
 * out of reach of other apps, which is where auth.ts always said this belonged.
 *
 * Web: localStorage, by choice rather than by accident. expo-secure-store has
 * no web implementation, and remembering on web was wanted anyway. The cost is
 * real: any script running on the page can read the token. Acceptable for a
 * build that is a development target; revisit before shipping a public web app.
 *
 * Nothing here throws. A failed write means "not remembered" and a failed read
 * means "nothing remembered" - neither is worth an error on screen.
 */

const KEY = "stdy.refreshToken";

const isWeb = Platform.OS === "web";

export const loadRefreshToken = async (): Promise<string | null> => {
  try {
    if (isWeb) return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
};

export const saveRefreshToken = async (token: string): Promise<void> => {
  try {
    if (isWeb) globalThis.localStorage?.setItem(KEY, token);
    else await SecureStore.setItemAsync(KEY, token);
  } catch {
    /* storage unavailable - this launch stays signed in, the next will not */
  }
};

export const clearRefreshToken = async (): Promise<void> => {
  try {
    if (isWeb) globalThis.localStorage?.removeItem(KEY);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* nothing stored, or storage unavailable - either way nothing to clear */
  }
};
