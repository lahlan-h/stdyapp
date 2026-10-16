import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * The app's haptic vocabulary: a handful of named feels, so the same kind of
 * moment always feels the same wherever it happens.
 *
 *   tick     - a choice moving: a rating, a chip, a toggle, a code box filling.
 *   tap      - a light press that does something small: a like, a pause.
 *   thud     - a press that commits to something: lock in, end, resume.
 *   success  - it worked: a session started, a group joined, a post sent.
 *   warning  - it worked, but mind this: the last break, nearly out of time.
 *   failure  - it did not work: a wrong code, a refused request.
 *
 * Never on scroll, and never for something the user did not just do - a buzz
 * for a passive update is noise in the hand.
 *
 * FIRE AND FORGET. Each returns nothing and swallows its own failure: a phone
 * with haptics switched off, a simulator, a web build - none of those is a
 * reason for the tap that asked to fail. The web has no haptics at all, so it
 * is skipped outright rather than calling into a module that would no-op.
 */
const fire = (feel: () => Promise<void>) => {
  if (Platform.OS === "web") return;
  feel().catch(() => {
    /* no haptics here - the action itself still happened */
  });
};

export const haptics = {
  tick: () => fire(() => Haptics.selectionAsync()),
  tap: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  thud: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  failure: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
} as const;
