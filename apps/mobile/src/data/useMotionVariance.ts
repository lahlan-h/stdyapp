import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { Accelerometer } from "expo-sensors";

/**
 * How still the device has been since the last reading.
 *
 * WHY VARIANCE AND NOT MAGNITUDE. At rest the accelerometer still reports ~1g,
 * because gravity never stops. A phone lying flat and a phone held upright both
 * read about 1 - the number says nothing about movement, only orientation.
 * Variance of that magnitude over a window does: it is ~0 for anything not
 * moving, whichever way up it is, and rises with how much it was disturbed.
 *
 * That also makes it the right shape for the server, which z-scores this
 * against the user's own baseline rather than any absolute threshold - a
 * fidgety person's "still" is not a calm person's "still".
 */

/**
 * 10 Hz. Fast enough to catch a phone being picked up and put down inside one
 * 15-second window, slow enough that the subscription is not a meaningful
 * battery cost over an hour of study.
 */
const SAMPLE_INTERVAL_MS = 100;

/**
 * Discard a window built from fewer readings than this.
 *
 * A variance over one or two points is noise dressed as a measurement. It
 * happens whenever a window is cut short - the app backgrounding mid-session
 * is the common case, and that is exactly when a bogus "perfectly still"
 * reading would flatter the score.
 */
const MIN_READINGS = 5;

/** Physically implausible for a phone in a pocket; a broken sensor, not motion. */
const MAX_VARIANCE = 1000;

/**
 * Used when no real reading is available: the sensor is missing, permission was
 * refused, or this is the web build, which has no accelerometer at all.
 *
 * A low, slightly noisy value - "sitting still, holding the phone". Chosen
 * deliberately rather than zero: a hard zero would be an unbeatable motion
 * score, so a browser session would outscore every real one.
 */
const FALLBACK = () => 0.08 + Math.random() * 0.06;

export interface MotionSource {
  /** Starts listening. Safe to call when already started. */
  startMotion: () => void;
  /** Stops listening and clears the window. */
  stopMotion: () => void;
  /**
   * Variance since the previous call, and resets the window. Falls back to a
   * plausible value when there is no usable sensor data.
   */
  readMotionVariance: () => number;
  /** False when the numbers are the fallback rather than a real sensor. */
  hasSensor: () => boolean;
}

export const useMotionVariance = (): MotionSource => {
  const windowRef = useRef<number[]>([]);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const availableRef = useRef(false);

  const startMotion = useCallback(() => {
    if (subscriptionRef.current) return;

    // react-native-web resolves expo-sensors to a stub whose listener never
    // fires, so the browser would silently report the fallback forever. Saying
    // so up front is clearer than looking like a dead sensor.
    if (Platform.OS === "web") {
      availableRef.current = false;
      return;
    }

    void (async () => {
      try {
        const available = await Accelerometer.isAvailableAsync();
        availableRef.current = available;
        if (!available) return;

        Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
        subscriptionRef.current = Accelerometer.addListener(({ x, y, z }) => {
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          if (Number.isFinite(magnitude)) windowRef.current.push(magnitude);
        });
      } catch {
        // A refused or missing sensor is a degraded estimate, never a failed
        // session. The fallback covers it.
        availableRef.current = false;
      }
    })();
  }, []);

  const stopMotion = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    windowRef.current = [];
  }, []);

  const readMotionVariance = useCallback((): number => {
    const readings = windowRef.current;
    windowRef.current = [];

    if (!availableRef.current || readings.length < MIN_READINGS) return FALLBACK();

    const mean = readings.reduce((a, b) => a + b, 0) / readings.length;
    const variance =
      readings.reduce((sum, v) => sum + (v - mean) ** 2, 0) / readings.length;

    if (!Number.isFinite(variance)) return FALLBACK();
    return Math.min(MAX_VARIANCE, Math.max(0, variance));
  }, []);

  const hasSensor = useCallback(() => availableRef.current, []);

  // The listener must not outlive the screen: left running it drains battery
  // for a session the user has already walked away from.
  useEffect(() => stopMotion, [stopMotion]);

  return { startMotion, stopMotion, readMotionVariance, hasSensor };
};
