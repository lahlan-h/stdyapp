import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStudyStyles, TASK_ICON_SIZE } from "@theme";
import { useStudySessions, type PastSession } from "@data";

/** Rows shown before "Show all", so the Start screen stays short. */
const COLLAPSED_COUNT = 5;

const duration = (minutes: number) =>
  minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export const describePastSession = (session: PastSession) =>
  `${when(session.startedAt)} · ${duration(session.minutes)}`;

/**
 * Past sessions, under Start on the Sessions view.
 *
 * Mounted only while the screen is idle, so it remounts - and reloads - every
 * time a session finishes and the user taps Done. No focus listener needed.
 */
const SessionHistory = () => {
  const { colors } = useTheme();
  const styles = useStudyStyles();
  const { sessions, isLoading, error, reload } = useStudySessions();
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? sessions : sessions?.slice(0, COLLAPSED_COUNT);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Recent sessions</Text>
        {sessions && sessions.length > 0 ? (
          <Text style={styles.cardCount}>{sessions.length}</Text>
        ) : null}
      </View>

      {error ? (
        <Pressable onPress={reload} accessibilityRole="button">
          <Text style={styles.errorText}>{error} Tap to try again.</Text>
        </Pressable>
      ) : null}

      {!sessions ? (
        isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
      ) : sessions.length === 0 ? (
        <Text style={styles.emptyText}>
          Finished sessions show up here.
        </Text>
      ) : (
        <View>
          {shown?.map((session, index) => (
            <View
              key={session.id}
              style={[styles.historyRow, index > 0 && styles.historyDivider]}
              accessible
              accessibilityLabel={[
                session.groupName ? `Group session in ${session.groupName}` : "Solo session",
                describePastSession(session),
                session.focusScore !== null ? `focus ${session.focusScore}` : null,
              ]
                .filter(Boolean)
                .join(", ")}
            >
              <Feather
                name={session.groupName ? "users" : "user"}
                size={TASK_ICON_SIZE}
                color={colors.textMuted}
              />
              <View style={styles.historyText}>
                <Text style={styles.historyTitle} numberOfLines={1}>
                  {session.groupName ?? "Solo"}
                </Text>
                <Text style={styles.historyMeta}>{describePastSession(session)}</Text>
              </View>
              {/* The estimate when there is one, the points otherwise - never both,
                  and never one passed off as the other. */}
              <Text style={styles.historyValue}>
                {session.focusScore !== null
                  ? `Focus ${session.focusScore}`
                  : `+${session.focusPoints} XP`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {sessions && sessions.length > COLLAPSED_COUNT ? (
        <Pressable
          style={styles.linkButton}
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>{expanded ? "Show less" : "Show all"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

export default SessionHistory;
