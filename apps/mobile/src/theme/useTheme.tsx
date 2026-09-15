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
import { useColorScheme, Appearance } from "react-native";

import { darkColors, lightColors, type ColorScheme } from "./colors";

// -Devs! Add additional stylesheet imports here!
import { createHomeStyles } from "./home.styles";
import { createStudyStyles } from "./study.styles";
import { createProfileStyles } from "./profile.styles";
import { createSettingsStyles } from "./settings.styles";

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
      // Added as the iOS tab navigator colour scheme wouldn't change from system defaults
      Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);

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
  }, [preference]); // Re-runs when preference changes and on mount...

  const isDarkMode =
    preference === "system" ? systemScheme === "dark" : preference === "dark";

  // Saves alongside the state update rather than inside a setState updater:
  // updaters must be pure, and React may call them more than once.
  const setThemePreference = useCallback((next: ThemePreference) => {
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
