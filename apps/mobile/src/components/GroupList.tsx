import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useGroupsStyles } from "@theme";
import { useGroups, MAX_GROUP_NAME_LENGTH } from "@data";

import GroupRow from "@components/GroupRow";

/**
 * The Study tab's Groups view: your groups, finding more, and making one.
 *
 * A component rather than a screen, for RoutineList's reason: it renders in
 * the Study tab's own scroller, under the view switch, and mounts only while
 * that switch is on Groups.
 *
 * Creating a group opens it straight away, as creating a routine does - the
 * group screen is where the join code to share lives.
 */
const GroupList = () => {
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
    busy,
    reload,
    search,
    loadMore,
    create,
  } = useGroups();

  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [query, setQuery] = useState("");

  /**
   * Reload on coming BACK to the Study tab - joining or leaving happens on the
   * group screen. Skips the first focus, which the hook has already loaded.
   */
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, [reload]),
  );

  const open = (id: string) => router.push({ pathname: "/group/[id]", params: { id } });

  const canCreate = name.trim().length > 0 && !busy;

  const submit = async () => {
    if (!canCreate) return;
    const group = await create({ name, isPrivate });
    if (group) {
      setName("");
      setIsPrivate(false);
      open(group.id);
    }
  };

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
          You are not in any groups yet. Find one below, or start your own.
        </Text>
      ) : (
        myGroups.map((group) => (
          <GroupRow key={group.id} group={group} onPress={() => open(group.id)} />
        ))
      )}

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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>New group</Text>
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            onSubmitEditing={submit}
            placeholder="e.g. COMP3000 study crew"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            maxLength={MAX_GROUP_NAME_LENGTH}
            accessibilityLabel="New group name"
          />
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              !canCreate && styles.disabled,
              pressed && styles.pressed,
            ]}
            onPress={submit}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityLabel="Create group"
          >
            {busy ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Feather name="plus" size={18} color={colors.surface} />
            )}
          </Pressable>
        </View>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Private - joining needs a code</Text>
          <Switch
            value={isPrivate}
            onValueChange={setIsPrivate}
            trackColor={{ true: colors.primary, false: colors.border }}
            accessibilityLabel="Private group"
          />
        </View>
      </View>
    </>
  );
};

export default GroupList;
