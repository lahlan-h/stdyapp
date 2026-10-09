import { View, Text, Image, Pressable, FlatList, ActivityIndicator } from "react-native";
import Feather from "@expo/vector-icons/Feather";

import { useTheme, useStyles, SEARCH_ROW_ICON_SIZE } from "@theme";
import { useUserSearch, useRecentSearches, type UserSummary } from "@data";

import { defaultAvatar } from "./defaultAvatar";

interface UserSearchListProps {
  query: string;
  /** Called with the person tapped. The screen closes the page and opens their profile. */
  onOpenUser: (user: UserSummary) => void;
}

/**
 * The part of `text` matching `query`, picked out in the accent colour.
 *
 * Case-insensitive, as the API's own match is, and only the FIRST occurrence -
 * that is the one that explains why the row is here.
 */
const Highlighted = ({ text, query, style }: { text: string; query: string; style: object }) => {
  const styles = useStyles("homeSearch");
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at === -1) return <Text style={style} numberOfLines={1}>{text}</Text>;

  return (
    <Text style={style} numberOfLines={1}>
      {text.slice(0, at)}
      <Text style={styles.userMatch}>{text.slice(at, at + query.length)}</Text>
      {text.slice(at + query.length)}
    </Text>
  );
};

/**
 * The search page: recent searches until something is typed, then results.
 *
 * One list for both states rather than two components, so the rows look and
 * behave identically whether they came from memory or from the API - only the
 * heading and the remove button differ.
 */
const UserSearchList = ({ query, onOpenUser }: UserSearchListProps) => {
  const { colors } = useTheme();
  const styles = useStyles("homeSearch");
  const { results, isSearching, error } = useUserSearch(query);
  const { recents, add, remove, clear } = useRecentSearches();

  const trimmed = query.trim();
  const isSearch = trimmed.length > 0;
  const rows = isSearch ? results : recents;

  const open = (user: UserSummary) => {
    add(user);
    onOpenUser(user);
  };

  const header = isSearch ? (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>Users</Text>
      {isSearching ? (
        <ActivityIndicator size="small" color={colors.textMuted} />
      ) : (
        <Text style={styles.userHandle}>
          {results.length} {results.length === 1 ? "result" : "results"}
        </Text>
      )}
    </View>
  ) : (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>Recent searches</Text>
      {recents.length > 0 ? (
        <Pressable onPress={clear} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.linkLabel}>Clear all</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const empty = isSearch ? (
    // Nothing to say while the first answer is still on its way: "no match"
    // flashing up before the results would be a lie for 300ms.
    isSearching ? null : error ? (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Search didn’t work</Text>
        <Text style={styles.emptyText}>{error}</Text>
      </View>
    ) : (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No users match “{trimmed}”</Text>
        <Text style={styles.emptyText}>Check the spelling or try a username.</Text>
      </View>
    )
  ) : (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No recent searches</Text>
      <Text style={styles.emptyText}>People you look up will show here.</Text>
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(user) => user.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={styles.sheetContent}
      // A tap on a row while the keyboard is up must open the row, not just
      // dismiss the keyboard and be swallowed.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <View style={styles.userRow}>
          <Pressable
            onPress={() => open(item)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.displayName}'s profile`}
            style={({ pressed }) => [styles.userMain, pressed && { opacity: 0.6 }]}
          >
            <Image
              source={{ uri: item.avatarUrl ?? defaultAvatar(item.displayName) }}
              style={styles.userAvatar}
              accessibilityIgnoresInvertColors
            />
            <View style={styles.userText}>
              <Highlighted text={item.displayName} query={trimmed} style={styles.userName} />
              <Highlighted text={`@${item.username}`} query={trimmed} style={styles.userHandle} />
            </View>
          </Pressable>

          {isSearch ? null : (
            <Pressable
              onPress={() => remove(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.displayName} from recent searches`}
              hitSlop={6}
              style={({ pressed }) => [styles.removeButton, pressed && { opacity: 0.6 }]}
            >
              <Feather name="x" size={SEARCH_ROW_ICON_SIZE} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      )}
    />
  );
};

export default UserSearchList;
