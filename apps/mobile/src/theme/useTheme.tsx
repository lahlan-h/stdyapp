import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance, useColorScheme } from "react-native";

import { darkColors, lightColors, type ColorScheme } from "./colors";

// -Devs! Add additional stylesheet imports here!
import { createHomeStyles } from "./home.styles";
import { createStudyStyles } from "./study.styles";
import { createProfileStyles } from "./profile.styles";
import { createSettingsStyles } from "./settings.styles";
import { createNewPostStyles } from "./newPost.styles";
import { createPostDetailStyles } from "./postDetail.styles";
import { createReportDialogStyles } from "./reportDialog.styles";
import { createTabBarStyles } from "./tabBar.styles";
import { createLoginStyles } from "./login.styles";
import { createRegisterStyles } from "./register.styles";
import { createForgotPasswordStyles } from "./forgotPassword.styles";
import { createEditProfileStyles } from "./editProfile.styles";
import { createAnalyticsStyles } from "./analytics.styles";
import { createHomeSearchStyles } from "./homeSearch.styles";
import { createMessagesStyles } from "./messages.styles";
import { createRoutinesStyles } from "./routines.styles";
import { createSessionHistoryStyles } from "./sessionHistory.styles";
import { createLeaderboardStyles } from "./leaderboard.styles";
import { createGroupsStyles } from "./groups.styles";
import { createPhotoViewerStyles } from "./photoViewer.styles";
import { createPlansStyles } from "./plans.styles";

const STORAGE_KEY = "themePreference";

/**
 * Where this preference used to live, as a bare `true`/`false`.
 *
 * Migrated on first launch rather than dropped: the old value was two-state, and
 * "follow the system" has no boolean spelling, so a straight switch to the new
 * key would silently reset the theme for everyone already running the app.
 */
const LEGACY_STORAGE_KEY = "darkMode";

/**
 * What the user CHOSE, which is not the same as what is on screen.
 *
 * "system" is a real choice meaning "no override" - it is the state the provider
 * starts in, and the settings screen has to be able to return to it. Modelling
 * this as a boolean is what made following the OS a one-way door.
 */
export type ThemePreference = "light" | "dark" | "system";

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

/**
 * Hands the choice down to the NATIVE views, which never read this context.
 *
 * The tab bar is the system's own (Liquid Glass on iOS 26, Material on
 * Android), and like alerts, the keyboard and the date picker it takes its
 * light or dark look from the OS rather than from `colors`. Without this, a
 * phone in dark mode running the app in Light drew a dark glass bar with white
 * labels over a white screen - and the reverse in Light-on-Dark. An override
 * here is what UIKit's overrideUserInterfaceStyle and Android's night mode
 * read, so every native view follows the in-app choice.
 *
 * "unspecified" lifts the override, which is exactly what "system" means.
 *
 * Safe to call repeatedly with the same value: it is a no-op on the native
 * side when nothing changes.
 *
 * Skipped where it does not exist: react-native-web's Appearance has no
 * setColorScheme - a browser has no native views to override - and calling it
 * there threw inside ThemeProvider and took the whole web app down.
 */
const applyNativeScheme = (preference: ThemePreference) => {
  if (typeof Appearance.setColorScheme !== "function") return;
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
};

/**
 * Translates an old `darkMode` value. Only a real boolean was ever a choice the
 * user made - anything else is junk, and junk means "no preference", not "light".
 */
const parseLegacyPreference = (raw: string): ThemePreference | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "boolean") return parsed ? "dark" : "light";
  } catch {
    /* unparseable - junk like any other */
  }
  return null;
};

// -Devs! Add the stylesheet here!
const styleMap = {
  home: createHomeStyles,
  study: createStudyStyles,
  profile: createProfileStyles,
  settings: createSettingsStyles,
  newPost: createNewPostStyles,
  postDetail: createPostDetailStyles,
  reportDialog: createReportDialogStyles,
  tabBar: createTabBarStyles,
  login: createLoginStyles,
  register: createRegisterStyles,
  forgotPassword: createForgotPasswordStyles,
  editProfile: createEditProfileStyles,
  analytics: createAnalyticsStyles,
  homeSearch: createHomeSearchStyles,
  messages: createMessagesStyles,
  routines: createRoutinesStyles,
  sessionHistory: createSessionHistoryStyles,
  leaderboard: createLeaderboardStyles,
  groups: createGroupsStyles,
  photoViewer: createPhotoViewerStyles,
  plans: createPlansStyles,
} as const;

type StyleName = keyof typeof styleMap;

type BuiltStyles = {
  [K in StyleName]: ReturnType<(typeof styleMap)[K]>;
};

// The cast is safe because we map over styleMap itself, so the output keys
// match the input keys by construction - Object.fromEntries just can't prove
// that to the type checker.
const buildStyles = (colors: ColorScheme): BuiltStyles =>
  Object.fromEntries(
    Object.entries(styleMap).map(([name, create]) => [name, create(colors)]),
  ) as BuiltStyles;

/**
 * Every stylesheet, built ONCE at module load.
 *
 * createHomeStyles used to be called in the render body of every component that
 * needed it, so each card in the feed rebuilt an entire StyleSheet on every
 * render. There are only two palettes, so there only ever need to be two sets -
 * useStyles picks one rather than building one.
 */
const STYLES = {
  light: buildStyles(lightColors),
  dark: buildStyles(darkColors),
} as const;

interface ThemeContextType {
  isDarkMode: boolean;
  /** The user's choice. "system" means no override - follow the OS. */
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  toggleDarkMode: () => void;
  colors: ColorScheme;
  styles: BuiltStyles;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemScheme = useColorScheme();

  // Starts at "system" - the OS decides until the user says otherwise. Keeping
  // the choice separate from the resolved value is what lets the system
  // preference keep working after mount; seeding state from the system once
  // meant later OS changes were ignored.
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // A corrupt or hand-edited value must not take the app down on launch.
      // Anything unreadable simply means "no preference" - follow the OS.
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (isThemePreference(stored)) {
          setPreference(stored);
          return;
        }

        const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        if (cancelled || legacy === null) return;

        const migrated = parseLegacyPreference(legacy);
        if (migrated !== null) {
          setPreference(migrated);
          // Write forward before clearing, so an interruption between the two
          // leaves the old key readable rather than losing the choice entirely.
          await AsyncStorage.setItem(STORAGE_KEY, migrated);
        }
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* storage unavailable - fall back to the system scheme */
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Keeps the native views on the same theme as the screens - see
   * applyNativeScheme. An effect as well as the call in setThemePreference,
   * because the stored choice also arrives by way of the load above, and a JS
   * reload starts back at "system" while the native override from before the
   * reload is still in place.
   */
  useEffect(() => {
    applyNativeScheme(preference);
  }, [preference]);

  // While an override is in place, useColorScheme reports the OVERRIDE rather
  // than the OS. That is harmless here: "system" is the only preference that
  // reads systemScheme, and choosing it lifts the override.
  const isDarkMode =
    preference === "system" ? systemScheme === "dark" : preference === "dark";

  // Saves alongside the state update rather than inside a setState updater:
  // updaters must be pure, and React may call them more than once.
  const setThemePreference = useCallback((next: ThemePreference) => {
    // In the same tap as the state update rather than an effect after it, so
    // the native bar and the screens repaint together instead of a frame
    // apart. Choosing System is the one case that settles a moment later:
    // until the OS reports its own scheme, useColorScheme still answers with
    // the override just lifted - which is the theme already on screen, so the
    // switch arrives as one clean change rather than a flicker.
    applyNativeScheme(next);
    setPreference(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      /* the choice still applies for this session */
    });
  }, []);

  /**
   * Kept for callers that only want to flip the visible theme, like a Switch.
   * Note this always lands on an explicit light/dark and so leaves "system"
   * behind - use setThemePreference where returning to the OS setting matters.
   */
  const toggleDarkMode = useCallback(() => {
    setThemePreference(isDarkMode ? "light" : "dark");
  }, [isDarkMode, setThemePreference]);

  // Memoized so consumers re-render when the theme actually changes, rather
  // than on every render of this provider.
  const value = useMemo<ThemeContextType>(
    () => ({
      isDarkMode,
      themePreference: preference,
      setThemePreference,
      toggleDarkMode,
      colors: isDarkMode ? darkColors : lightColors,
      styles: isDarkMode ? STYLES.dark : STYLES.light,
    }),
    [isDarkMode, preference, setThemePreference, toggleDarkMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};

/**
 * A stylesheet for the active theme, by name - e.g. useStyles("home").
 * Never rebuilds: it picks one of the two sets in STYLES.
 */
export const useStyles = <K extends StyleName>(name: K): BuiltStyles[K] => {
  return useTheme().styles[name];
};

// Per-screen shorthands for useStyles, kept so the screens written against
// them keep working. Each is exactly useStyles(<name>).

/** The home stylesheet for the active theme. Never rebuilds. */
export const useHomeStyles = () => useStyles("home");

/** @see useStyles */
export const useStudyStyles = () => useStyles("study");

/** The settings stylesheet for the active theme. Never rebuilds. */
export const useSettingsStyles = () => useStyles("settings");

/** The tab bar stylesheet for the active theme. Never rebuilds. */
export const useTabBarStyles = () => useStyles("tabBar");

/** The new-post stylesheet for the active theme. Never rebuilds. */
export const useNewPostStyles = () => useStyles("newPost");

/** The post-detail stylesheet for the active theme. Never rebuilds. */
export const usePostDetailStyles = () => useStyles("postDetail");

/** The report-dialog stylesheet for the active theme. Never rebuilds. */
export const useReportDialogStyles = () => useStyles("reportDialog");

/** The login stylesheet for the active theme. Never rebuilds. */
export const useLoginStyles = () => useStyles("login");

/**
 * The sign-up screen's own stylesheet for the active theme. Never rebuilds.
 * Used alongside useLoginStyles, which supplies everything the two share.
 */
export const useRegisterStyles = () => useStyles("register");

/**
 * The forgot-password screen's own stylesheet for the active theme. Never
 * rebuilds. Used alongside useLoginStyles, as register's is.
 */
export const useForgotPasswordStyles = () => useStyles("forgotPassword");

/** The edit-profile stylesheet for the active theme. Never rebuilds. */
export const useEditProfileStyles = () => useStyles("editProfile");

/** The analytics stylesheet for the active theme. Never rebuilds. */
export const useAnalyticsStyles = () => useStyles("analytics");

/** The routines stylesheet for the active theme. Never rebuilds. */
export const useRoutinesStyles = () => useStyles("routines");

/** The groups stylesheet for the active theme. Never rebuilds. */
export const useGroupsStyles = () => useStyles("groups");