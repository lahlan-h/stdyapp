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

const STORAGE_KEY = "darkMode";

/**
 * Both stylesheets, built ONCE at module load.
 *
 * createHomeStyles used to be called in the render body of every component that
 * needed it, so each card in the feed rebuilt an entire StyleSheet on every
 * render. There are only two palettes, so there only ever need to be two
 * stylesheets - useHomeStyles picks one rather than building one.
 */
const HOME_STYLES = {
  light: createHomeStyles(lightColors),
  dark: createHomeStyles(darkColors),
} as const;

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  colors: ColorScheme;
  homeStyles: (typeof HOME_STYLES)["light"];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemScheme = useColorScheme();

  // null means "not chosen" - fall through to the system. Storing the override
  // separately is what lets the system preference keep working after mount;
  // seeding state from the system once meant later OS changes were ignored.
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (cancelled || value === null) return;
        // Guarded: a corrupt or hand-edited value must not take the app down on
        // launch. An unreadable preference simply means "no preference".
        try {
          const parsed = JSON.parse(value);
          if (typeof parsed === "boolean") setOverride(parsed);
        } catch {
          AsyncStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => {
        /* storage unavailable - fall back to the system scheme */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDarkMode = override ?? systemScheme === "dark";

  const toggleDarkMode = useCallback(() => {
    setOverride((current) => {
      const next = !(current ?? systemScheme === "dark");
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
        /* the toggle still applies for this session */
      });
      return next;
    });
  }, [systemScheme]);

  // Memoized so consumers re-render when the theme actually changes, rather
  // than on every render of this provider.
  const value = useMemo<ThemeContextType>(
    () => ({
      isDarkMode,
      toggleDarkMode,
      colors: isDarkMode ? darkColors : lightColors,
      homeStyles: isDarkMode ? HOME_STYLES.dark : HOME_STYLES.light,
    }),
    [isDarkMode, toggleDarkMode],
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

