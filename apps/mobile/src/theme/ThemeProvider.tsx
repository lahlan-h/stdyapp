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
import { useColorScheme } from "react-native";

import { darkColors, lightColors, type ColorScheme } from "./colors";
import { createHomeStyles } from "./home.styles";
import { createSettingsStyles } from "./settings.styles";
import { createNewPostStyles } from "./newPost.styles";
import { createPostDetailStyles } from "./postDetail.styles";
import { createTabBarStyles } from "./tabBar.styles";

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
 * Every stylesheet, built ONCE at module load.
 *
 * createHomeStyles used to be called in the render body of every component that
 * needed it, so each card in the feed rebuilt an entire StyleSheet on every
 * render. There are only two palettes, so there only ever need to be two of each
 * stylesheet - the hooks below pick one rather than building one.
 */
const HOME_STYLES = {
  light: createHomeStyles(lightColors),
  dark: createHomeStyles(darkColors),
} as const;

const SETTINGS_STYLES = {
  light: createSettingsStyles(lightColors),
  dark: createSettingsStyles(darkColors),
} as const;

const NEW_POST_STYLES = {
  light: createNewPostStyles(lightColors),
  dark: createNewPostStyles(darkColors),
} as const;

const POST_DETAIL_STYLES = {
  light: createPostDetailStyles(lightColors),
  dark: createPostDetailStyles(darkColors),
} as const;

const TAB_BAR_STYLES = {
  light: createTabBarStyles(lightColors),
  dark: createTabBarStyles(darkColors),
} as const;

interface ThemeContextType {
  isDarkMode: boolean;
  /** The user's choice. "system" means no override - follow the OS. */
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  toggleDarkMode: () => void;
  colors: ColorScheme;
  homeStyles: (typeof HOME_STYLES)["light"];
  settingsStyles: (typeof SETTINGS_STYLES)["light"];
  tabBarStyles: (typeof TAB_BAR_STYLES)["light"];
  newPostStyles: (typeof NEW_POST_STYLES)["light"];
  postDetailStyles: (typeof POST_DETAIL_STYLES)["light"];
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
      // Guarded throughout: a corrupt or hand-edited value must not take the app
      // down on launch. An unreadable preference simply means "no preference".
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (isThemePreference(stored)) {
          setPreference(stored);
          return;
        }

        const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        if (cancelled || legacy === null) return;

        const migrated: ThemePreference =
          JSON.parse(legacy) === true ? "dark" : "light";
        setPreference(migrated);
        // Write forward before clearing, so an interruption between the two
        // leaves the old key readable rather than losing the choice entirely.
        await AsyncStorage.setItem(STORAGE_KEY, migrated);
        await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* storage unavailable or unparseable - fall back to the system scheme */
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDarkMode =
    preference === "system" ? systemScheme === "dark" : preference === "dark";

  const setThemePreference = useCallback((next: ThemePreference) => {
    setPreference(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      /* the choice still applies for this session */
    });
  }, []);

  /**
   * Kept for callers that only want to flip the visible theme. Note this always
   * lands on an explicit light/dark and so leaves "system" behind - use
   * setThemePreference where returning to the OS setting matters.
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
      homeStyles: isDarkMode ? HOME_STYLES.dark : HOME_STYLES.light,
      settingsStyles: isDarkMode ? SETTINGS_STYLES.dark : SETTINGS_STYLES.light,
      tabBarStyles: isDarkMode ? TAB_BAR_STYLES.dark : TAB_BAR_STYLES.light,
      newPostStyles: isDarkMode ? NEW_POST_STYLES.dark : NEW_POST_STYLES.light,
      postDetailStyles: isDarkMode
        ? POST_DETAIL_STYLES.dark
        : POST_DETAIL_STYLES.light,
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

/** The home stylesheet for the active theme. Never rebuilds. */
export const useHomeStyles = () => useTheme().homeStyles;

/** The settings stylesheet for the active theme. Never rebuilds. */
export const useSettingsStyles = () => useTheme().settingsStyles;

/** The tab bar stylesheet for the active theme. Never rebuilds. */
export const useTabBarStyles = () => useTheme().tabBarStyles;

/** The new-post stylesheet for the active theme. Never rebuilds. */
export const useNewPostStyles = () => useTheme().newPostStyles;

/** The post-detail stylesheet for the active theme. Never rebuilds. */
export const usePostDetailStyles = () => useTheme().postDetailStyles;
