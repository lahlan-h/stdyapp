import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useGroupsStyles, GROUPS_HEADER_ICON_SIZE } from "@theme";
import {
  useGroup,
  requestStudySession,
  MAX_JOIN_CODE_LENGTH,
  type GroupPerson,
  type LiveSession,
} from "@data";

import { defaultAvatar } from "@components/defaultAvatar";
import GroupEditCard from "@components/GroupEditCard";
import GroupMemberRow from "@components/GroupMemberRow";

const minutesSince = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/** "25m in · 35m left", or just "25m in" for an open-ended session. */
const progress = (startedAt: string, plannedMinutes: number | null) => {
  const elapsed = minutesSince(startedAt);
  if (!plannedMinutes) return `${elapsed}m in`;
  const left = plannedMinutes - elapsed;
  return left > 0 ? `${elapsed}m in · ${left}m left` : `${elapsed}m in · finishing`;
};

/** Everyone studying together: the sessions that share one first session. */
interface Room {
  id: string;
  /** The host while they are still studying, else whoever has been in longest. */
  lead: LiveSession;
  others: LiveSession[];
  includesMe: boolean;
}

const toRooms = (sessions: LiveSession[]): Room[] => {
  const byRoom = new Map<string, LiveSession[]>();
  for (const session of sessions) {
    const key = session.hostSessionId ?? session.id;
    byRoom.set(key, [...(byRoom.get(key) ?? []), session]);
  }

  // The API orders by startedAt, so members[0] is the longest in.
  return [...byRoom.entries()].map(([id, members]) => {
    const lead = members.find((session) => session.id === id) ?? members[0];
    return {
      id,
      lead,
      others: members.filter((session) => session !== lead),
      includesMe: members.some((session) => session.isMine),
    };
  });
};

/** "with bob, you" - who else is in the room, the viewer named as such. */
const withNames = (room: Room) =>
  room.others.length === 0
    ? ""
    : ` · with ${room.others.map((s) => (s.isMine ? "you" : s.user.username)).join(", ")}`;

/**
 * One study group. Pushed from the Study tab's Groups view.
 *
 * Non-members see what the group is and a way in. Members also see who is
 * studying right now, with a Join beside each, and can start a group session
 * of their own. Both hand off to the Study tab, which owns the session clock -
 * see studyRequest.ts.
 */
const GroupScreen = () => {
  const { colors } = useTheme();
  const styles = useGroupsStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    group,
    members,
    liveSessions,
    isLoading,
    loadError,
    actionError,
    clearActionError,
    busy,
    reload,
    join,
    leave,
    update,
    regenerateJoinCode,
    deleteGroup,
    removeMember,
    setRole,
    transferOwnership,
  } = useGroup(id);

  const [joinCode, setJoinCode] = useState("");
  const [editing, setEditing] = useState(false);
  /** Which member has their actions open. One at a time. */
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  /**
   * Reload on coming back - someone may have started or finished studying
   * while the user was on the Study tab. Skips the first focus, which the hook
   * has already loaded.
   */
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) reload();
      focusedOnce.current = true;
    }, [reload]),
  );

  const submitJoin = async () => {
    if (await join(joinCode)) setJoinCode("");
  };

  const askLeave = () => {
    if (!group) return;
    Alert.alert(`Leave ${group.name}?`, "You can join again later.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => void leave() },
    ]);
  };

  const askNewCode = () =>
    Alert.alert(
      "Make a new join code?",
      "The current code stops working. People already in the group stay in.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "New code", onPress: () => void regenerateJoinCode() },
      ],
    );

  const askDelete = () => {
    if (!group) return;
    Alert.alert(
      `Delete ${group.name}?`,
      "Everyone is removed from it. Past sessions are kept, just no longer tied to the group. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (await deleteGroup()) router.back();
          },
        },
      ],
    );
  };

  /** Closes the member's panel first, so a finished action does not leave it hanging open. */
  const act = (action: () => Promise<boolean>) => {
    setOpenMemberId(null);
    void action();
  };

  const startHere = () => {
    if (!group) return;
    requestStudySession({ kind: "group", groupId: group.id, groupName: group.name });
    router.navigate("/study");
  };

  const joinSession = (inviteCode: string) => {
    if (!group) return;
    requestStudySession({ kind: "join", inviteCode, groupName: group.name });
    router.navigate("/study");
  };

  const Person = ({ person, meta, children }: {
    person: GroupPerson;
    meta?: string;
    children?: React.ReactNode;
  }) => (
    <View style={styles.personRow}>
      <Image
        style={styles.avatar}
        source={{ uri: person.avatarUrl ?? defaultAvatar(person.username) }}
        accessibilityIgnoresInvertColors
      />
      <View style={styles.personText}>
        <Text style={styles.personName} numberOfLines={1}>
          {person.username}
        </Text>
        {meta ? <Text style={styles.personMeta}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );

  const error = actionError ?? loadError;
  // Rooms with someone OTHER than the viewer in them - a room of one, the
  // viewer, is nobody to study with.
  const rooms = toRooms(liveSessions ?? []).filter(
    (room) => !room.includesMe || room.others.length > 0,
  );
  const othersStudying = liveSessions?.filter((session) => !session.isMine).length ?? 0;

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoading && !!group}
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
              <Feather name="chevron-left" size={GROUPS_HEADER_ICON_SIZE} color={colors.text} />
            </Pressable>
            <Text style={styles.detailTitle} numberOfLines={3}>
              {group?.name ?? ""}
            </Text>
            {/* Owners and admins; the edit card itself decides who sees privacy. */}
            {group && (group.isOwner || group.role === "ADMIN") && !editing ? (
              <Pressable
                style={styles.headerButton}
                onPress={() => setEditing(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit group"
              >
                <Feather name="edit-2" size={GROUPS_HEADER_ICON_SIZE} color={colors.text} />
              </Pressable>
            ) : null}
          </View>

          {error ? (
            <Pressable
              style={styles.error}
              onPress={loadError ? reload : clearActionError}
              accessibilityRole="button"
            >
              <Feather name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>
                {error}
                {loadError ? "\nTap to try again." : ""}
              </Text>
            </Pressable>
          ) : null}

          {!group ? (
            isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
          ) : (
            <>
              {editing ? (
                <GroupEditCard
                  group={group}
                  busy={busy}
                  onSave={update}
                  onDone={() => setEditing(false)}
                />
              ) : null}

              <View style={styles.card}>
                {group.description ? (
                  <Text style={styles.description}>{group.description}</Text>
                ) : null}
                <View style={styles.metaRow}>
                  <Text style={styles.routineMetaText}>
                    {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                  </Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{group.isPrivate ? "Private" : "Public"}</Text>
                  </View>
                  {group.isOwner ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Owner</Text>
                    </View>
                  ) : group.isMember ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Joined</Text>
                    </View>
                  ) : null}
                </View>

                {/* Only the owner is ever sent the code - the API strips it for everyone else. */}
                {group.isOwner && group.isPrivate && group.joinCode ? (
                  <View style={styles.codeRow}>
                    <View>
                      <Text style={styles.cardTitle}>Join code</Text>
                      <Text style={styles.codeText} selectable>
                        {group.joinCode}
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.panelButton, pressed && styles.pressed]}
                      onPress={askNewCode}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel="Make a new join code"
                    >
                      <Feather name="refresh-cw" size={14} color={colors.text} />
                      <Text style={styles.panelButtonText}>New code</Text>
                    </Pressable>
                  </View>
                ) : null}

                {!group.isMember ? (
                  <>
                    {group.isPrivate ? (
                      <TextInput
                        style={styles.input}
                        value={joinCode}
                        onChangeText={setJoinCode}
                        onSubmitEditing={submitJoin}
                        placeholder="Join code"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={MAX_JOIN_CODE_LENGTH}
                        accessibilityLabel="Join code"
                      />
                    ) : null}
                    <Pressable
                      style={({ pressed }) => [
                        styles.primaryButton,
                        (busy || (group.isPrivate && !joinCode.trim())) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      onPress={submitJoin}
                      disabled={busy || (group.isPrivate && !joinCode.trim())}
                      accessibilityRole="button"
                      accessibilityLabel="Join group"
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.surface} />
                      ) : (
                        <Feather name="user-plus" size={GROUPS_HEADER_ICON_SIZE} color={colors.surface} />
                      )}
                      <Text style={styles.primaryButtonText}>Join group</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                    onPress={startHere}
                    accessibilityRole="button"
                    accessibilityLabel="Start a group session"
                    accessibilityHint="Opens the Study tab with this group selected"
                  >
                    <Feather name="play" size={GROUPS_HEADER_ICON_SIZE} color={colors.surface} />
                    <Text style={styles.primaryButtonText}>Start a group session</Text>
                  </Pressable>
                )}
              </View>

              {group.isMember ? (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Studying now</Text>
                    {othersStudying > 0 ? (
                      <Text style={styles.cardCount}>{othersStudying}</Text>
                    ) : null}
                  </View>
                  {rooms.length === 0 ? (
                    <Text style={styles.emptyText}>
                      Nobody else is studying right now. Start a session and others can join you.
                    </Text>
                  ) : (
                    rooms.map((room) => (
                      <Person
                        key={room.id}
                        person={room.lead.user}
                        meta={
                          progress(room.lead.startedAt, room.lead.plannedMinutes) +
                          withNames(room)
                        }
                      >
                        {room.includesMe ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>You're in</Text>
                          </View>
                        ) : (
                          <Pressable
                            style={({ pressed }) => [styles.rowButton, pressed && styles.pressed]}
                            // Any code in the room leads to it; the lead's is as good as any.
                            onPress={() => joinSession(room.lead.inviteCode)}
                            accessibilityRole="button"
                            accessibilityLabel={`Join ${room.lead.user.username}'s session`}
                          >
                            <Text style={styles.rowButtonText}>Join</Text>
                          </Pressable>
                        )}
                      </Person>
                    ))
                  )}
                </View>
              ) : null}

              {members && members.length > 0 ? (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>Members</Text>
                    <Text style={styles.cardCount}>{members.length}</Text>
                  </View>
                  {members.map((member) => (
                    <GroupMemberRow
                      key={member.userId}
                      member={member}
                      group={group}
                      isOpen={openMemberId === member.userId}
                      onToggle={() =>
                        setOpenMemberId((prev) => (prev === member.userId ? null : member.userId))
                      }
                      onSetRole={(role) => act(() => setRole(member.userId, role))}
                      onRemove={() => act(() => removeMember(member.userId))}
                      onTransfer={() => act(() => transferOwnership(member.userId))}
                    />
                  ))}
                </View>
              ) : null}

              {/* The owner cannot leave - the API answers 409 - so they get Delete below instead. */}
              {group.isMember && !group.isOwner ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.dangerButton,
                    busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={askLeave}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Leave group"
                >
                  <Feather name="log-out" size={GROUPS_HEADER_ICON_SIZE} color={colors.danger} />
                  <Text style={styles.dangerButtonText}>Leave group</Text>
                </Pressable>
              ) : null}

              {/* The owner's way out instead of leaving - or they hand it over first. */}
              {group.isOwner ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.dangerButton,
                    busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  onPress={askDelete}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Delete group"
                >
                  <Feather name="trash-2" size={GROUPS_HEADER_ICON_SIZE} color={colors.danger} />
                  <Text style={styles.dangerButtonText}>Delete group</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default GroupScreen;
