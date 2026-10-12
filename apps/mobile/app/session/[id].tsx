import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, SESSION_HISTORY_HEADER_ICON_SIZE } from "@theme";
import { useSessionDetail, type SessionDetail } from "@data";

import FocusTrace from "@components/FocusTrace";
import RatingStars from "@components/RatingStars";
import { focusBand, focusBandColor } from "@components/focusBand";
import {
  NONE,
  dayLabel,
  formatMinutes,
  formatSeconds,
  formatTime,
} from "@components/sessionFormat";

/**
 * One past session, shown the way its recap showed it when it ended: one card
 * per metric, then the focus-over-time trace. Opened from the session history.
 *
 * The metric cards and the trace use the Study tab's own styles, so a session
 * looks the same here as it did on the "Session complete" screen.
 */
const SessionDetailScreen = () => {
  const { colors } = useTheme();
  const styles = useStyles("sessionHistory");
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, isLoading, loadError, reload } = useSessionDetail(id);

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading && !!session}
              onRefresh={reload}
              tintColor={colors.textMuted}
            />
          }
        >
          <View style={styles.header}>
            <Pressable
              style={styles.headerButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Feather
                name="chevron-left"
                size={SESSION_HISTORY_HEADER_ICON_SIZE}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.screenTitle} numberOfLines={1}>
              {session ? dayLabel(session.startedAt) : "Session"}
            </Text>
          </View>

          {loadError ? (
            <Pressable style={styles.error} onPress={reload} accessibilityRole="button">
              <Feather name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>
                {loadError}
                {"\n"}Tap to try again.
              </Text>
            </Pressable>
          ) : null}

          {!session ? (
            isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
          ) : (
            <SessionDetailBody session={session} />
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

/** Everything below the header, for a session that has loaded. */
const SessionDetailBody = ({ session }: { session: SessionDetail }) => {
  const { colors } = useTheme();
  const styles = useStyles("sessionHistory");
  const study = useStyles("study");

  const band = focusBand(session.focusScore);
  const bandColor = focusBandColor(band.key, colors);

  const when = session.endedAt
    ? `${formatTime(session.startedAt)} – ${formatTime(session.endedAt)}`
    : formatTime(session.startedAt);
  const kind = session.isGroup ? "Group session" : "Solo session";
  const status =
    session.status === "abandoned"
      ? " · Abandoned"
      : session.status === "active"
        ? " · In progress"
        : "";

  return (
    <>
      <Text style={styles.detailMeta}>
        {when} · {kind}
        {status}
      </Text>

      <Metric icon="clock" tint={colors.success} label="Total time">
        <Text style={study.metricValue}>
          {session.endedAt ? formatMinutes(session.totalSec / 60) : NONE}
        </Text>
      </Metric>

      <Metric icon="target" tint={colors.warning} label="Focus estimate">
        <View style={[study.bandPill, { backgroundColor: colors.successTint }]}>
          <View style={[study.bandDot, { backgroundColor: bandColor }]} />
          <Text style={[study.bandPillText, { color: bandColor }]}>{band.label}</Text>
        </View>
        {/* Null is "no estimate" and shows as a dash - never as 0. */}
        <Text style={[study.metricValue, { color: bandColor }]}>
          {session.focusScore ?? NONE}
        </Text>
      </Metric>

      <Metric icon="trending-up" tint={colors.primary} label="Focus-weighted time">
        <Text style={study.metricValue}>{formatMinutes(session.focusWeightedMinutes)}</Text>
      </Metric>

      {session.tasksTotal > 0 ? (
        <Metric icon="check-square" tint={colors.primary} label="Tasks done">
          <Text
            style={[
              study.metricValue,
              session.tasksCompleted === session.tasksTotal ? { color: colors.success } : null,
            ]}
          >
            {session.tasksCompleted}/{session.tasksTotal}
          </Text>
        </Metric>
      ) : null}

      <Metric icon="zap-off" tint={colors.danger} label="Distractions">
        <Text style={study.metricValue}>
          {session.interruptionCount}
          {session.awaySeconds > 0 ? ` · ${formatSeconds(session.awaySeconds)}` : ""}
        </Text>
      </Metric>

      <Metric icon="star" tint={colors.warning} label="Your rating">
        {session.selfRating !== null ? (
          <RatingStars value={session.selfRating} size={16} />
        ) : (
          <Text style={study.metricValue}>{NONE}</Text>
        )}
      </Metric>

      <Metric icon="award" tint={colors.primary} label="XP earned">
        <Text style={[study.metricValue, { color: colors.primary }]}>
          +{session.focusPoints} XP
        </Text>
      </Metric>

      {/* Omitted, as on the recap, when the session produced no samples. */}
      {session.trace ? <FocusTrace timeline={session.trace} /> : null}

      <Text style={styles.footnote}>
        Focus is an estimate from your phone's signals, not a measurement.
        {session.hadWatch ? " Heart rate from your watch was included." : ""}
      </Text>
    </>
  );
};

/** The recap's metric card: icon, label, value - read-only here. */
const Metric = ({
  icon,
  tint,
  label,
  children,
}: {
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  label: string;
  children: ReactNode;
}) => {
  const study = useStyles("study");
  return (
    <View style={study.metricCard}>
      <View style={study.metricIcon}>
        <Feather name={icon} size={17} color={tint} />
      </View>
      <Text style={study.metricLabel}>{label}</Text>
      {children}
    </View>
  );
};

export default SessionDetailScreen;
