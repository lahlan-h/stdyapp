import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useGroupsStyles } from "@theme";
import { useGroups, MAX_GROUP_NAME_LENGTH } from "@data";

import GroupRow from "@components/GroupRow";
import JoinOrCreateGroupCard from "@components/JoinOrCreateGroupCard";

interface GroupListProps {
  /**
   * A session is running. Then this is only your groups, to look at: joining
   * and making groups is for before you study - the Study tab's setup - never
   * the middle of a session, where it would only be a distraction.
   */
  sessionRunning?: boolean;
}

/**
 * The Study tab's Groups view: your groups, then - before a session - a way in
 * by code, a way to make one, and a search for public groups to look through.
 *
 * A component rather than a screen, for RoutineList's reason: it renders in
 * the Study tab's own scroller, under the view switch, and mounts only while
 * that switch is on Groups.
 */
const GroupList = ({ sessionRunning = false }: GroupListProps) => {
  const { colors } = useTheme();
  const styles = useGroupsStyles();
  const {
    myGroups,
    results,
    hasMore,
    isLoading,
    isSearching,
    loadError,
    actionError,
    reload,
    search,
    loadMore,
    applyGroupChanges,
  } = useGroups();

  const [query, setQuery] = useState("");

  /**
   * Catch up on coming BACK to the Study tab - joining, leaving, editing and
   * deleting all happen on the group screen. "Your groups" is re-read whole;
   * search results are patched (see groupSignal.ts), since they may be several
   * pages deep. Skips the first focus, which the hook has already loaded.
   */
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) {
        reload();
        applyGroupChanges();
      }
      focusedOnce.current = true;
    }, [reload, applyGroupChanges]),
  );

  const open = (id: string) => router.push({ pathname: "/group/[id]", params: { id } });

  const error = actionError ?? loadError;

  return (
    <>
      {error ? (
        <Pressable style={styles.error} onPress={reload} accessibilityRole="button">
          <Feather name="alert-circle" size={18} color={colors.danger} />
          <Text style={styles.errorText}>
            {error}
            {loadError ? "\nTap to try again." : ""}
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.sectionLabel}>Your groups</Text>
      {!myGroups ? (
        isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
      ) : myGroups.length === 0 ? (
        <Text style={styles.emptyText}>
          {sessionRunning
            ? "You are not in any groups yet."
            : "You are not in any groups yet. Join one with a code, or start your own."}
        </Text>
      ) : (
        myGroups.map((group) => (
          <GroupRow key={group.id} group={group} onPress={() => open(group.id)} />
        ))
      )}

      {sessionRunning ? (
        <View style={styles.lockedNote}>
          <Feather name="lock" size={16} color={colors.primary} />
          <Text style={styles.lockedNoteText}>
            Joining and making groups opens up again when this session ends.
          </Text>
        </View>
      ) : (
        <>
          <JoinOrCreateGroupCard />

          {/* Public groups, to browse. A private one is found here too, but
              only its code - from someone in it - lets you in. */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Find a group</Text>
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => search(query)}
                placeholder="Search by name"
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
                autoCapitalize="none"
                maxLength={MAX_GROUP_NAME_LENGTH}
                accessibilityLabel="Search groups"
              />
              <Pressable
                style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
                onPress={() => search(query)}
                accessibilityRole="button"
                accessibilityLabel="Search"
              >
                {isSearching ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Feather name="search" size={18} color={colors.surface} />
                )}
              </Pressable>
            </View>
            {results && results.length === 0 ? (
              <Text style={styles.emptyText}>No groups match that.</Text>
            ) : null}
          </View>

          {results?.map((group) => (
            <GroupRow key={group.id} group={group} onPress={() => open(group.id)} />
          ))}

          {results && hasMore ? (
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                isSearching && styles.disabled,
                pressed && styles.pressed,
              ]}
              onPress={loadMore}
              disabled={isSearching}
              accessibilityRole="button"
              accessibilityLabel="Load more groups"
            >
              {isSearching ? (
                <ActivityIndicator color={colors.textMuted} />
              ) : (
                <Text style={styles.secondaryButtonText}>Load more</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </>
  );
};

export default GroupList;
