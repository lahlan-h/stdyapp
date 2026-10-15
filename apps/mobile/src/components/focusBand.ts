import type { ColorScheme } from "@theme";

/**
 * The words and colour a focus ESTIMATE is shown with.
 *
 * Lifted out of the Study tab so the session recap and the session history
 * describe the same score the same way - a 55 must not be "Patchy" in one
 * place and something else in the other.
 *
 * Bands, not a gradient. Two words land where a number needs interpreting, and
 * the estimate is not precise enough to justify finer grain.
 */
export type FocusBandKey = "good" | "mid" | "poor" | "none";

export interface FocusBand {
  label: string;
  key: FocusBandKey;
}

export const focusBand = (score: number | null): FocusBand => {
  if (score === null) return { label: "No reading", key: "none" };
  if (score >= 80) return { label: "Deep focus", key: "good" };
  if (score >= 60) return { label: "Solid focus", key: "good" };
  if (score >= 40) return { label: "Patchy", key: "mid" };
  return { label: "Distracted", key: "poor" };
};

/** Palette token for a band. "No reading" falls back to primary, not grey. */
export const focusBandColor = (key: FocusBandKey, colors: ColorScheme): string =>
  key === "good"
    ? colors.success
    : key === "mid"
      ? colors.warning
      : key === "poor"
        ? colors.danger
        : colors.primary;
