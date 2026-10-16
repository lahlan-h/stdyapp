import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useGroupsStyles, haptics, GROUPS_HEADER_ICON_SIZE } from "@theme";
import { useFocusSession, useJoinGroupByCode } from "@data";

import JoinCodeInput from "./JoinCodeInput";
import CreateGroupSheet from "./CreateGroupSheet";

const openGroup = (id: string) => router.push({ pathname: "/group/[id]", params: { id } });

interface JoinOrCreateGroupCardProps {
  /** A session's code was typed and its session joined - show the session. */
  onJoinedSession?: () => void;
}

/**
 * Getting into a study group, before a session: type a friend's code, or make
 * a group of your own.
 *
 * The code is the whole way in - public or private, six characters joins.
 * A full row joins straight away and opens the group; your own group's code
 * just opens it. A wrong one shakes and says so, and typing again clears it.
 *
 * A friend's live SESSION code works here too - the one a running group
 * session shares - and joins that session, so there is one place to type any
 * code. The session's own rules apply: a private group's session still needs
 * its group joined first, which the Study tab then offers.
 *
 * Only drawn while no session is running: joining and making groups is
 * something you do before you study, never in the middle of it.
 */
const JoinOrCreateGroupCard = ({ onJoinedSession }: JoinOrCreateGroupCardProps) => {
  const { colors } = useTheme();
  const styles = useGroupsStyles();
  const { joinByCode, isJoining, error, clearError } = useJoinGroupByCode();
  const { join: joinSession } = useFocusSession();

  const [code, setCode] = useState("");
  const [shakeKey, setShakeKey] = useState(0);
  const [creating, setCreating] = useState(false);

  const join = async (full: string) => {
    const result = await joinByCode(full);
    if (result.kind === "failed") {
      haptics.failure();
      setShakeKey((key) => key + 1);
      return;
    }
    setCode("");
    if (result.kind === "session") {
      haptics.success();
      joinSession(result.code, result.groupName ?? undefined);
      onJoinedSession?.();
    } else if (result.kind === "joined") {
      haptics.success();
      openGroup(result.group.id);
    } else {
      openGroup(result.groupId);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Join a study group</Text>
        {isJoining ? <ActivityIndicator color={colors.textMuted} /> : null}
      </View>
      <Text style={styles.joinCardCaption}>
        Got a code from a friend? Type it in to join their group - or their session.
      </Text>

      <JoinCodeInput
        value={code}
        onChange={(next) => {
          if (error) clearError();
          setCode(next);
        }}
        onComplete={join}
        invalid={Boolean(error)}
        shakeKey={shakeKey}
        disabled={isJoining}
      />

      {error ? (
        <Text style={styles.joinError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={styles.orRow} accessibilityElementsHidden importantForAccessibility="no">
        <View style={styles.orRule} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.orRule} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        onPress={() => {
          haptics.tap();
          setCreating(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Create a study group"
      >
        <Feather name="plus" size={GROUPS_HEADER_ICON_SIZE} color={colors.text} />
        <Text style={styles.secondaryButtonText}>Create a study group</Text>
      </Pressable>

      <CreateGroupSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(group) => {
          setCreating(false);
          openGroup(group.id);
        }}
      />
    </View>
  );
};

export default JoinOrCreateGroupCard;
