import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Accelerometer, Pedometer } from "expo-sensors";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

/**
 * "Phone down" - the study habit of putting the phone face-down and leaving it.
 *
 * WHY THIS IS NOT LOCK DETECTION. iOS gives an app no way to tell "the screen
 * was locked" from "the user switched to Instagram": both suspend the app, and
 * a suspended app reads no sensors. So locking the phone cannot be measured as
 * stillness, only inferred afterwards. Two mechanisms cover it instead:
 *
 *  1. FACE-DOWN MODE (measured). While STDY is open and the phone lies
 *     face-down and still, the screen is kept from auto-locking and the study
 *     screen goes black (an OLED black screen draws almost nothing). The app
 *     stays in the foreground, so samples keep flowing and score the stillness
 *     honestly - no inference at all.
 *
 *  2. LOCKED FROM FACE-DOWN (inferred). If the user leaves the app within a few
 *     seconds of the phone being face-down, and the step counter shows no steps
 *     for the time away, the absence is treated as phone-down time rather than
 *     a distraction. This one CAN be gamed - pick the phone up, open Instagram,
 *     sit still - which is why it needs the face-down lead-in at all rather than
 *     applying to every absence.
 */

/**
 * z at or above this reads as face-down. iOS reports ~+1g on z with the screen
 * facing the table and ~-1g facing up. 0.85 allows a ~30 degree tilt - a phone
 * on a book or a lumpy desk.
 */
const FACE_DOWN_Z = 0.85;

/** Per-axis spread (g) across the recent window still counted as "not moving". */
const STILL_SPREAD = 0.06;

/**
 * Readings in the stillness window: ~2 seconds at the 10 Hz useMotionVariance
 * sets. The update interval is global to the accelerometer, so this hook
 * deliberately does not set its own - doing so would change the motion
 * signal's sampling rate underneath it.
 */
const STILL_WINDOW = 20;

/** Face-down and still for this long before the mode engages. */
const ENGAGE_MS = 3_000;

/**
 * How recently the phone must have been face-down for an absence to count as
 * "locked from face-down": long enough to pick it up and press the side
 * button, short enough that it is not "face-down a while ago".
 */
export const PHONE_DOWN_LEAD_MS = 10_000;

const KEEP_AWAKE_TAG = "stdy-phone-down";

export interface PhoneDownSource {
  /** Face-down mode is engaged right now. */
  isPhoneDown: boolean;
  startPhoneDown: () => void;
  stopPhoneDown: () => void;
  /** Whether the phone was face-down and still within `withinMs` of now. */
  wasPhoneDownRecently: (withinMs?: number) => boolean;
  /**
   * Steps taken between two instants, or null when that cannot be known - no
   * pedometer (simulator, web), permission refused, or the query failed. Null
   * must be read as "no evidence", never as zero steps.
   */
  stepsBetween: (fromMs: number, toMs: number) => Promise<number | null>;
}

export const usePhoneDown = (): PhoneDownSource => {
  const [isPhoneDown, setIsPhoneDown] = useState(false);

  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const windowRef = useRef<{ x: number; y: number; z: number }[]>([]);
  const downSinceRef = useRef<number | null>(null);
  const lastDownAtRef = useRef<number | null>(null);
  const engagedRef = useRef(false);

  const setEngaged = useCallback((engaged: boolean) => {
    if (engagedRef.current === engaged) return;
    engagedRef.current = engaged;
    setIsPhoneDown(engaged);

    // Keep-awake is what stops iOS auto-locking a phone nobody is touching -
    // without it face-down mode would end itself after the auto-lock delay.
    if (engaged) {
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
  }, []);

  const onReading = useCallback(
    ({ x, y, z }: { x: number; y: number; z: number }) => {
      if (![x, y, z].every(Number.isFinite)) return;

      const window = windowRef.current;
      window.push({ x, y, z });
      if (window.length > STILL_WINDOW) window.shift();

      const spread = (axis: "x" | "y" | "z") => {
        const values = window.map((r) => r[axis]);
        return Math.max(...values) - Math.min(...values);
      };
      const still =
        window.length === STILL_WINDOW &&
        spread("x") < STILL_SPREAD &&
        spread("y") < STILL_SPREAD &&
        spread("z") < STILL_SPREAD;

      const now = Date.now();
      if (z >= FACE_DOWN_Z && still) {
        downSinceRef.current ??= now;
        lastDownAtRef.current = now;
        if (now - downSinceRef.current >= ENGAGE_MS) setEngaged(true);
      } else {
        downSinceRef.current = null;
        setEngaged(false);
      }
    },
    [setEngaged],
  );

  const startPhoneDown = useCallback(() => {
    if (subscriptionRef.current || Platform.OS === "web") return;

    void (async () => {
      try {
        if (!(await Accelerometer.isAvailableAsync())) return;
        subscriptionRef.current = Accelerometer.addListener(onReading);
      } catch {
        // No face-down mode is a missing nicety, never a failed session.
      }

      // Asked up front, while the user is looking at the screen, rather than
      // on return from an absence, when a permission sheet would be confusing.
      try {
        if (await Pedometer.isAvailableAsync()) {
          const { granted } = await Pedometer.getPermissionsAsync();
          if (!granted) await Pedometer.requestPermissionsAsync();
        }
      } catch {
        /* no pedometer: absences are simply never credited */
      }
    })();
  }, [onReading]);

  const stopPhoneDown = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    windowRef.current = [];
    downSinceRef.current = null;
    lastDownAtRef.current = null;
    setEngaged(false);
  }, [setEngaged]);

  const wasPhoneDownRecently = useCallback(
    (withinMs = PHONE_DOWN_LEAD_MS) =>
      lastDownAtRef.current !== null && Date.now() - lastDownAtRef.current <= withinMs,
    [],
  );

  const stepsBetween = useCallback(async (fromMs: number, toMs: number) => {
    if (Platform.OS !== "ios" || !(toMs > fromMs)) return null;
    try {
      if (!(await Pedometer.isAvailableAsync())) return null;
      const { granted } = await Pedometer.getPermissionsAsync();
      if (!granted) return null;
      const { steps } = await Pedometer.getStepCountAsync(new Date(fromMs), new Date(toMs));
      return Number.isFinite(steps) ? steps : null;
    } catch {
      return null;
    }
  }, []);

  // The listener and keep-awake must not outlive the screen.
  useEffect(() => stopPhoneDown, [stopPhoneDown]);

  return { isPhoneDown, startPhoneDown, stopPhoneDown, wasPhoneDownRecently, stepsBetween };
};
