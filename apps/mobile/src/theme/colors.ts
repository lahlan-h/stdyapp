/**
 * The app's colour palette.
 *
 * Every colour the UI renders must come from here. Hard-coding a hex in a
 * StyleSheet silently opts that element out of dark mode - which is exactly the
 * bug the feed's body text had, where a fixed light grey was invisible against
 * the light theme's white surface.
 */
export interface ColorScheme {
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  success: string;
  warning: string;
  danger: string;
  /**
   * `danger` at low alpha, for a control that is destructive but not loud.
   *
   * The discard button on the compose screen sits over scrolling content, so it
   * needs a fill of its own; a solid red one would shout louder than anything
   * else on the screen. Derived from `danger` rather than picked separately so
   * the two stay the same red.
   */
  dangerTint: string;
  dangerEdge: string;
  /**
   * `success` at low alpha, the green twin of the pair above.
   *
   * Derived from `success` rather than picked separately, for exactly the reason
   * dangerTint gives: the report dialog's confirmation badge has to be the same
   * green as everything else in the app that means "done", and a second green
   * chosen by eye would drift from it the first time either moved.
   */
  successTint: string;
  successEdge: string;
  /**
   * The wash a modal lays over the screen behind it.
   *
   * THE SAME VALUE IN BOTH THEMES, like gradients.primary, and for a sharper
   * reason than that one: a scrim's whole job is to push what is behind it out
   * of the foreground, and in the light theme there is no lighter colour to do
   * that with. Black is not "the dark theme's scrim" here - it is the only
   * direction a scrim can go.
   *
   * A token anyway rather than an inline rgba, because the rule at the top of
   * this file has no exceptions: the day the two themes want different values,
   * that is one edit here instead of one in every modal that ever shipped.
   */
  scrim: string;
  /**
   * What the login screen's logo banner paints behind itself.
   *
   * The logo (packages/shared/assets/stdy.png) sets its wordmark in #add8e6 on
   * transparency: 1.42:1 against the light theme's bg, so bare in light mode
   * the word "stdy" simply is not there. Rather than recolour the logo, the
   * banner lays down the dark ground it was drawn for - the dark theme's bg,
   * not a new colour.
   *
   * TRANSPARENT in dark, not that same navy: the screen behind is already that
   * ground, and a panel would not blend - the background gradient has moved on
   * by the banner's lower edge, so any flat fill leaves a visible step exactly
   * where the join should disappear.
   */
  brandBanner: string;
  /**
   * Google's sign-in button, in Google's colours rather than ours.
   *
   * Their branding rules fix the fill, edge and label per theme, and a "Continue
   * with Google" restyled in the app's blue is exactly what those rules exist to
   * prevent. The button's shape is still the app's control, so it sits in the
   * same family as the submit button below it.
   */
  google: {
    fill: string;
    edge: string;
    text: string;
  };
  shadow: string;
  gradients: {
    background: [string, string];
    surface: [string, string];
    primary: [string, string];
    success: [string, string];
    warning: [string, string];
    danger: [string, string];
    muted: [string, string];
    empty: [string, string];
  };
  backgrounds: {
    input: string;
    editInput: string;
    /**
     * Base fill behind the tab bar's blur, so it must carry alpha.
     *
     * The blur alone is not enough: Android's implementation is far weaker than
     * iOS's, and on a busy feed the bar reads as a smear of the cards behind it
     * with no edge of its own. This sits under the blur and gives the bar a
     * floor in both cases.
     */
    tabBar: string;
  };
  statusBarStyle: "light-content" | "dark-content";
}

export const lightColors: ColorScheme = {
  bg: "#f8fafc",
  surface: "#ffffff",
  text: "#1e293b",
  textMuted: "#64748b",
  border: "#e2e8f0",
  primary: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  dangerTint: "rgba(239,68,68,0.12)",
  dangerEdge: "rgba(239,68,68,0.28)",
  successTint: "rgba(16,185,129,0.12)",
  successEdge: "rgba(16,185,129,0.28)",
  scrim: "rgba(0,0,0,0.55)",
  brandBanner: "#0f172a",
  google: {
    fill: "#ffffff",
    edge: "#747775",
    text: "#1f1f1f",
  },
  shadow: "#000000",
  gradients: {
    background: ["#f8fafc", "#e2e8f0"],
    surface: ["#ffffff", "#f8fafc"],
    primary: ["#3b82f6", "#1d4ed8"],
    success: ["#10b981", "#059669"],
    warning: ["#f59e0b", "#d97706"],
    danger: ["#ef4444", "#dc2626"],
    muted: ["#9ca3af", "#6b7280"],
    empty: ["#f3f4f6", "#e5e7eb"],
  },
  backgrounds: {
    input: "#ffffff",
    editInput: "#ffffff",
    tabBar: "rgba(255,255,255,0.72)",
  },
  statusBarStyle: "dark-content" as const,
};

export const darkColors: ColorScheme = {
  bg: "#0f172a",
  surface: "#1e293b",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  border: "#334155",
  primary: "#60a5fa",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  dangerTint: "rgba(248,113,113,0.16)",
  dangerEdge: "rgba(248,113,113,0.34)",
  // The same +0.04 / +0.06 lift over light the danger pair takes: a tint that
  // held its light-theme alpha would all but vanish against the dark surface.
  successTint: "rgba(52,211,153,0.16)",
  successEdge: "rgba(52,211,153,0.34)",
  scrim: "rgba(0,0,0,0.55)",
  brandBanner: "transparent",
  google: {
    fill: "#131314",
    edge: "#8e918f",
    text: "#e3e3e3",
  },
  shadow: "#000000",
  gradients: {
    background: ["#0f172a", "#1e293b"],
    surface: ["#1E293B", "#334155"],
    primary: ["#3b82f6", "#1d4ed8"],
    success: ["#10b981", "#059669"],
    warning: ["#f59e0b", "#d97706"],
    danger: ["#ef4444", "#dc2626"],
    muted: ["#374151", "#4b5563"],
    empty: ["#374151", "#4b5563"],
  },
  backgrounds: {
    input: "#1e293b",
    editInput: "#0f172a",
    tabBar: "rgba(15,23,42,0.72)",
  },
  statusBarStyle: "light-content" as const,
};
