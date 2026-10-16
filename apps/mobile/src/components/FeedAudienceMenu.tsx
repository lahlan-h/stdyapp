import { Modal, Pressable, ScrollView, Text, View, ActivityIndicator } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, SEARCH_ROW_ICON_SIZE } from "@theme";
import { useGroups, type FeedAudience } from "@data";

interface FeedAudienceMenuProps {
  audience: FeedAudience;
  /** Where the menu's top edge sits - just under the title. */
  top: number;
  onSelect: (audience: FeedAudience) => void;
  onClose: () => void;
}

/**
 * Whose posts the feed shows: the people you follow, or one of your study
 * groups. Nothing wider - see FeedAudience.
 *
 * Mounted only while open, which is what keeps the groups request off the
 * feed's own start-up: the list is read when someone asks to choose from it.
 *
 * A Modal so it sits over the panel and the tab bar alike, and any tap outside
 * it closes it.
 */
const FeedAudienceMenu = ({ audience, top, onSelect, onClose }: FeedAudienceMenuProps) => {
  const { colors } = useTheme();
  const styles = useStyles("homeSearch");
  const { myGroups, isLoading, loadError } = useGroups();

  const option = (
    key: string,
    label: string,
    caption: string | null,
    selected: boolean,
    next: FeedAudience,
  ) => (
    <Pressable
      key={key}
      style={({ pressed }) => [
        styles.audienceOption,
        selected && styles.audienceOptionSelected,
        pressed && { opacity: 0.7 },
      ]}
      onPress={() => onSelect(next)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={caption ? `${label}. ${caption}` : label}
    >
      <View style={styles.audienceOptionText}>
        <Text style={styles.audienceOptionLabel} numberOfLines={1}>
          {label}
        </Text>
        {caption ? <Text style={styles.audienceOptionCaption}>{caption}</Text> : null}
      </View>
      {selected ? (
        <Feather name="check" size={SEARCH_ROW_ICON_SIZE} color={colors.primary} />
      ) : null}
    </Pressable>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.audienceBackdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />

      <View style={[styles.audienceMenu, { top }]}>
        <ScrollView bounces={false}>
          {option(
            "following",
            "Following",
            "You and the people you follow",
            audience.kind === "following",
            { kind: "following" },
          )}

          <Text style={styles.audienceSection}>Study groups</Text>
          {myGroups === undefined ? (
            loadError ? (
              <Text style={styles.audienceNote}>{loadError}</Text>
            ) : isLoading ? (
              <ActivityIndicator color={colors.textMuted} style={{ paddingVertical: 10 }} />
            ) : null
          ) : myGroups.length === 0 ? (
            <Text style={styles.audienceNote}>
              Join a group from the Study tab to see its members' posts here.
            </Text>
          ) : (
            myGroups.map((group) =>
              option(
                group.id,
                group.name,
                null,
                audience.kind === "group" && audience.groupId === group.id,
                { kind: "group", groupId: group.id, groupName: group.name },
              ),
            )
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

export default FeedAudienceMenu;
