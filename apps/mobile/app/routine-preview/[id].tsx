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

import { useTheme, useRoutinesStyles, ROUTINES_HEADER_ICON_SIZE } from "@theme";
import { useRoutinePreview } from "@data";

import { formatDue } from "@components/DueDateChips";

/**
 * Someone else's routine, opened from the chip on their post: the plan, read
 * only, and a button that copies it into your own routines.
 *
 * A push, for routine/[id]'s reason. Saving REPLACES this screen with your new
 * copy rather than pushing it, so Back returns to the post you came from
 * instead of to a preview you have already acted on.
 */
const RoutinePreviewScreen = () => {
  const { colors } = useTheme();
  const styles = useRoutinesStyles();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { preview, isLoading, loadError, reload, save, isSaving, saveError } =
    useRoutinePreview(id);

  const onSave = async () => {
    const copy = await save();
    if (copy) router.replace(`/routine/${copy.id}`);
  };

  // Your own routine, reached through a preview link - a post opened from
  // somewhere that did not know it was yours. You get the real thing.
  const onOpenOwn = () => router.replace(`/routine/${id}`);

  const error = loadError ?? saveError;

  return (
    <LinearGradient colors={colors.gradients.background} style={styles.container}>
      <StatusBar barStyle={colors.statusBarStyle} translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading && !!preview}
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
              <Feather name="chevron-left" size={ROUTINES_HEADER_ICON_SIZE} color={colors.text} />
            </Pressable>
            <Text style={styles.detailTitle} numberOfLines={3}>
              {preview?.title ?? ""}
            </Text>
          </View>

          {preview ? (
            <Pressable
              onPress={() => router.push(`/user/${preview.owner.id}`)}
              hitSlop={6}
              accessibilityRole="link"
              accessibilityLabel={`Shared by ${preview.owner.username}. Open their profile`}
            >
              <Text style={styles.ownerText}>Shared by @{preview.owner.username}</Text>
            </Pressable>
          ) : null}

          {error ? (
            <Pressable
              style={styles.error}
              onPress={loadError ? reload : undefined}
              disabled={!loadError}
              accessibilityRole={loadError ? "button" : undefined}
            >
              <Feather name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errorText}>
                {error}
                {loadError ? "\nTap to try again." : ""}
              </Text>
            </Pressable>
          ) : null}

          {!preview ? (
            isLoading ? <ActivityIndicator color={colors.textMuted} /> : null
          ) : (
            <>
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Tasks</Text>
                  <Text style={styles.cardCount}>{preview.todoCount}</Text>
                </View>
                {preview.todoItems.length === 0 ? (
                  <Text style={styles.emptyText}>No tasks in this routine yet.</Text>
                ) : (
                  preview.todoItems.map((todo, index) => (
                    <View
                      key={todo.id}
                      style={[styles.todoRow, index > 0 && styles.todoDivider]}
                    >
                      <Feather name="circle" size={18} color={colors.border} />
                      <View style={styles.todoText}>
                        <Text style={styles.todoTitle}>{todo.title}</Text>
                        {todo.dueDate ? (
                          <View style={styles.dueRow}>
                            <Feather name="calendar" size={12} color={colors.textMuted} />
                            <Text style={styles.dueText}>Due {formatDue(todo.dueDate)}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))
                )}
              </View>

              <Pressable
                onPress={preview.isOwn ? onOpenOwn : onSave}
                disabled={isSaving}
                style={({ pressed }) => [
                  styles.saveButton,
                  isSaving && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={preview.isOwn ? "Open routine" : "Save to my routines"}
                accessibilityState={{ disabled: isSaving, busy: isSaving }}
              >
                <LinearGradient
                  colors={colors.gradients.primary}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={styles.saveFill}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <Feather
                        name={preview.isOwn ? "arrow-right" : "copy"}
                        size={ROUTINES_HEADER_ICON_SIZE}
                        color="#ffffff"
                      />
                      <Text style={styles.saveLabel}>
                        {preview.isOwn ? "Open routine" : "Save to my routines"}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </Pressable>

              {preview.isOwn ? null : (
                <Text style={styles.footnote}>
                  You get your own copy to tick off and edit. Changes on either side
                  stay with that side.
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default RoutinePreviewScreen;
