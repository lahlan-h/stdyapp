import { type ReactNode } from "react";
import { View } from "react-native";

import { useStyles, DIAL_TICKS } from "@theme";

/**
 * A circular progress dial, built from tick marks.
 *
 * TICKS RATHER THAN A DRAWN ARC, and that is a dependency decision more than an
 * aesthetic one: a smooth arc needs react-native-svg, which this app does not
 * depend on, and adding a package to the mobile workspace is not a call to make
 * from inside one feature. Sixty ticks read as a dial at a glance, cost nothing
 * but Views, and suit an instrument that reports an estimate rather than a
 * precise measurement.
 *
 * Each tick sits at the top of a full-size container rotated about the centre,
 * which is what places it on the circle - transforms in React Native rotate
 * about a view's own middle, so this is the one construction that needs no
 * trigonometry and no measured layout.
 */
interface FocusDialProps {
  /** 0-1. Values outside the range are clamped rather than wrapping. */
  progress: number;
  /** Colour of the filled ticks. Always a palette token from the caller. */
  color: string;
  /** The reading itself - a time, a score, or a placeholder. */
  children: ReactNode;
}

const FocusDial = ({ progress, color, children }: FocusDialProps) => {
  const styles = useStyles("study");

  const filled = Math.round(Math.max(0, Math.min(1, progress)) * DIAL_TICKS);

  return (
    <View style={styles.dial}>
      {Array.from({ length: DIAL_TICKS }, (_, i) => (
        <View
          key={i}
          style={[styles.tickTrack, { transform: [{ rotate: `${(360 / DIAL_TICKS) * i}deg` }] }]}
          pointerEvents="none"
        >
          <View style={[styles.tick, i < filled && { backgroundColor: color }]} />
        </View>
      ))}
      <View style={styles.dialCenter}>{children}</View>
    </View>
  );
};

export default FocusDial;
