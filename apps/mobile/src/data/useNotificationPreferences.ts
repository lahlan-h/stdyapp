import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "notificationPreferences";

/**
 * Which notifications the user wants.
 *
 * FRONT END ONLY. Nothing sends a notification yet - expo-notifications is not
 * installed and no permission is ever requested, so these are a stored choice
 * and nothing more. They live here rather than in component state because they
 * belong to the user, not the screen: when notifications are actually built,
 * these move onto the backend alongside the rest of the user record and only
 * this file changes. Do NOT present these as working in the UI.
 */
export interface NotificationPreferences {
  studyReminders: boolean;
  friendActivity: boolean;
  weeklySummary: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  studyReminders: true,
  friendActivity: true,
  weeklySummary: false,
};

/**
 * Merges onto the defaults rather than trusting the stored object wholesale, so
 * adding a key later does not read as `undefined` for everyone who already has
 * a value written, and a truncated write cannot drop a toggle off the screen.
 */
const parsePreferences = (raw: string): NotificationPreferences => {
  const stored = JSON.parse(raw) as Partial<Record<keyof NotificationPreferences, unknown>>;
  const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES };

  for (const key of Object.keys(merged) as (keyof NotificationPreferences)[]) {
    if (typeof stored?.[key] === "boolean") merged[key] = stored[key] as boolean;
  }
  return merged;
};

export interface NotificationPreferencesState {
  preferences: NotificationPreferences;
  setPreference: (key: keyof NotificationPreferences, value: boolean) => void;
}

export const useNotificationPreferences = (): NotificationPreferencesState => {
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || raw === null) return;
        // A corrupt value must not take the screen down; unreadable simply
        // means "no preference saved", which is what the defaults already are.
        try {
          setPreferences(parsePreferences(raw));
        } catch {
          AsyncStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => {
        /* storage unavailable - the defaults stand for this session */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback(
    (key: keyof NotificationPreferences, value: boolean) => {
      setPreferences((current) => {
        const next = { ...current, [key]: value };
        // Persisted from inside the updater so the write always reflects the
        // state actually committed, rather than a `preferences` captured by a
        // stale closure if two toggles are tapped in the same tick.
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
          /* the toggle still applies for this session */
        });
        return next;
      });
    },
    [],
  );

  return { preferences, setPreference };
};
