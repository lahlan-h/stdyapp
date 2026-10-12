const path = require("node:path");

// The monorepo's one .env, loaded the same way metro.config.js does - Expo would
// otherwise look in apps/mobile and find nothing.
require("@expo/env").load(path.resolve(__dirname, "../.."), { force: true });

const GOOGLE_CLIENT_ID_SUFFIX = ".apps.googleusercontent.com";

/**
 * "123-abc.apps.googleusercontent.com" -> "com.googleusercontent.apps.123-abc"
 *
 * Google's iOS client IDs come with this reversed form as their redirect
 * scheme: after sign-in, Google sends the user back to
 * com.googleusercontent.apps.<id>:/oauthredirect, which is where
 * expo-auth-session's Google provider waits on iOS.
 */
const reversedClientId = (id) =>
  id && id.endsWith(GOOGLE_CLIENT_ID_SUFFIX)
    ? `com.googleusercontent.apps.${id.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length)}`
    : null;

/**
 * app.json, plus what depends on .env.
 *
 * The reversed iOS client ID is registered as a second URL scheme. Without it
 * iOS has no app to hand Google's redirect to, and sign-in stalls in the
 * browser instead of returning. It only takes effect in a native build
 * (npx expo run:ios or an EAS development build) - URL schemes are compiled in.
 *
 * stdyapp stays first: it is the app's own scheme, the one expo-router deep
 * links use. With no iOS client ID set, the config is exactly app.json's.
 */
module.exports = ({ config }) => {
  const iosGoogleScheme = reversedClientId(
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim(),
  );

  return {
    ...config,
    scheme: iosGoogleScheme ? [config.scheme, iosGoogleScheme] : config.scheme,
  };
};
