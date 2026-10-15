import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StatusBar,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, SESSION_HISTORY_HEADER_ICON_SIZE } from "@theme";
import { useSessionHistory, type SessionHistoryItem } from "@data";

import SessionHistoryCard from "@components/SessionHistoryCard";
import { dayLabel, localDayKey } from "@components/sessionFormat";

interface DaySection {
  key: string;
  title: string;
  data: SessionHistoryItem[];
}

/**
 * Newest-first rows into one section per local day. The API already orders by
 * startedAt descending, so a single pass that starts a new section whenever
 * the day changes keeps that order without sorting again.
 */
const groupByDay = (sessions: SessionHistoryItem[]): DaySection[] => {
  const now = new Date();
  const sections: DaySection[] = [];
  for (const session of sessions) {
    const key = localDayKey(session.startedAt);
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.data.push(session);
    else sections.push({ key, title: dayLabel(session.startedAt, now), data: [session] });
  }
  return sections;
};

/**
 * The caller's past study sessions, grouped by day. Opened from Settings.
 *
 * A push over the tabs, like routine/[id]: you go there and come back, so it
 * carries its own back button - the root Stack hides every header.
 */
const SessionHistory = () => {
  const { colors } = useTheme();
  const styles = useStyles("sessionHistory");
  const insets = useSafeAreaInsets();
  const { sessions, isLoading, loadError, reload } = useSessionHistory();

  const sections = useMemo(() => (sessions ? groupByDay(sessions) : []), [sessions]);

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              // Only once something is on screen - the first load has its own
              // spinner, and two at once looks like a glitch.
              refreshing={isLoading && !!sessions}
              onRefresh={reload}
              tintColor={colors.textMuted}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
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
                <Text style={styles.screenTitle}>Session history</Text>
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

              {!sessions && isLoading ? <ActivityIndicator color={colors.textMuted} /> : null}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.dayTitle}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <SessionHistoryCard
              session={item}
              onPress={() => router.push({ pathname: "/session/[id]", params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            sessions ? (
              <View style={styles.empty}>
                <Feather name="clock" size={22} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No sessions yet</Text>
                <Text style={styles.emptyText}>
                  Finish a study session and it will show up here with its focus estimate.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            sessions && sessions.length > 0 ? (
              <Text style={styles.footnote}>
                Focus is an estimate from your phone's signals, not a measurement.
              </Text>
            ) : null
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default SessionHistory;
