import { useEffect, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useNewPostStyles,
  useKeyboardLift,
  EXIT_ICON_SIZE,
  NEW_POST_ROW_ICON_SIZE,
} from "@theme";
import {
  useCreatePost,
  useSessionDetail,
  useSessionRating,
  useDiscardSession,
  preparePhoto,
  MAX_PHOTO_BYTES,
  MAX_POST_PHOTOS,
  MAX_CAPTION_LENGTH,
  MAX_TITLE_LENGTH,
  type PreparedPhoto,
} from "@data";

import {
  SessionLinkPicker,
  RoutineLinkPicker,
  type LinkChoice,
} from "@components/LinkPicker";
import { NONE, formatSeconds } from "@components/sessionFormat";
import RatingSheet from "@components/RatingSheet";
import { confirmDiscardSession } from "@components/confirmDiscardSession";

/** What the API's magic-byte sniff will accept. GIF is deliberately not in it. */
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * One link row: tap to choose, x to clear. Says what is linked once something
 * is, and what linking would add before.
 */
const LinkRow = ({
  icon,
  label,
  hint,
  choice,
  onPress,
  onClear,
  divider = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  hint: string;
  choice: LinkChoice | null;
  onPress: () => void;
  onClear: () => void;
  divider?: boolean;
}) => {
  const { colors } = useTheme();
  const newPostStyles = useNewPostStyles();

  return (
    <Pressable
      style={({ pressed }) => [
        newPostStyles.row,
        divider && newPostStyles.rowDivider,
        pressed && { opacity: 0.6 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={choice ? `${label}: ${choice.label}. Tap to change` : label}
    >
      <View style={newPostStyles.rowIconBox}>
        <Feather
          name={icon}
          size={NEW_POST_ROW_ICON_SIZE}
          color={choice ? colors.primary : colors.textMuted}
        />
      </View>
      <View style={newPostStyles.rowText}>
        <Text style={newPostStyles.rowLabel}>{label}</Text>
        <Text style={newPostStyles.rowValue} numberOfLines={1}>
          {choice ? choice.label : hint}
        </Text>
      </View>
      {choice ? (
        <Pressable
          style={newPostStyles.rowClear}
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove linked ${label.replace("Link a ", "")}`}
        >
          <Feather name="x" size={NEW_POST_ROW_ICON_SIZE} color={colors.textMuted} />
        </Pressable>
      ) : (
        <Feather name="chevron-right" size={NEW_POST_ROW_ICON_SIZE} color={colors.textMuted} />
      )}
    </Pressable>
  );
};

/**
 * Compose a post.
 *
 * Presented as a modal from the Study tab when a session finishes - there is
 * no other way in, since a post is about a session. A title is required, plus
 * a photo OR a caption - either, or both. A title alone is not a post, and the
 * API refuses one with a 400 (see createPost in post.service.js).
 *
 * POST OR DISCARD. For a session that just ended there are exactly two ways
 * out, as on Hevy's save screen: publish it, or discard it, which deletes the
 * session. The swipe-down that would otherwise dismiss the modal is switched
 * off in the root layout, and Android's back button asks to discard.
 */
const NewPost = () => {
  const { colors } = useTheme();
  const newPostStyles = useNewPostStyles();
  const insets = useSafeAreaInsets();
  const { createPost, isSubmitting, stage, error, reset } = useCreatePost();
  // Set when the Study tab opens this screen for the session that just ended,
  // so the post arrives already linked.
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const finishedId = params.sessionId;
  // Read back from the server rather than passed in, so the duration shown is
  // the one the session was saved with.
  const { session: finished } = useSessionDetail(finishedId);

  /**
   * The focus rating, asked once as the composer opens - where the recap used
   * to ask it. Over the form rather than before it, so flicking it away is a
   * cheap way to skip: a rating someone felt cornered into is worse data than
   * none.
   */
  const { rating, rate, error: ratingError } = useSessionRating(finishedId);
  const [ratingOpen, setRatingOpen] = useState(Boolean(finishedId));

  const { discard, isDiscarding, error: discardError } = useDiscardSession();

  /**
   * The Post button rides up with the keyboard, as the comment box on a post
   * does, so it can be tapped without closing the keyboard first. No gap: the
   * footer is a bar of its own and sits flush on the keys.
   */
  const footer = useRef<View>(null);
  const { lift: keyboardLift, isLifted } = useKeyboardLift(footer, 0);

  /** The X: deletes a just-finished session, after asking; otherwise just closes. */
  const leave = () => {
    if (!finishedId) {
      router.back();
      return;
    }
    confirmDiscardSession(async () => {
      if (await discard(finishedId)) router.back();
    });
  };

  // Android's back button is a way out too, so it gets the same question
  // rather than quietly leaving the session posted nowhere. Android only:
  // nothing else has the button, and react-native-web logs an error for every
  // subscription. No dependency list: re-subscribing each render keeps the
  // handler calling the current leave(), which closes over the latest state.
  useEffect(() => {
    if (!finishedId || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      leave();
      return true;
    });
    return () => subscription.remove();
  });

  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  // In posting order: the first is the one the feed frames the post by.
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  // Shrinking just-picked photos - see preparePhoto. Usually well under a second.
  const [preparing, setPreparing] = useState(false);
  const [session, setSession] = useState<LinkChoice | null>(
    params.sessionId ? { id: params.sessionId, label: "The session you just finished" } : null,
  );
  const [routine, setRoutine] = useState<LinkChoice | null>(null);
  const [picker, setPicker] = useState<"session" | "routine" | null>(null);

  // Mirrors the API's rule: a title, plus photos or a caption.
  const hasBody = photos.length > 0 || caption.trim().length > 0;
  const canSubmit = title.trim().length > 0 && hasBody && !isSubmitting && !preparing;
  const room = MAX_POST_PHOTOS - photos.length;

  const pickPhotos = async () => {
    if (room <= 0) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photos are off",
        "stdy needs access to your photos to attach them to a post. Turn it on in Settings.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // Several at once, up to what is left of MAX_POST_PHOTOS, in the order
      // tapped. No crop step: each goes up whole, in its own shape.
      allowsMultipleSelection: true,
      selectionLimit: room,
      orderedSelection: true,
      // Compatible, because without a crop step iOS hands back the ORIGINAL
      // file, which is usually HEIC. This has iOS convert it to JPEG; Android's
      // HEIF is converted by preparePhoto instead.
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled) return;

    setPreparing(true);
    try {
      const prepared = await Promise.all(
        result.assets.slice(0, room).map((asset) =>
          preparePhoto({
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            mimeType: asset.mimeType,
          }),
        ),
      );

      // Checked on the PREPARED file, not the original: shrinking usually
      // brings a photo well under the limit, and converts HEIF to JPEG. What
      // is left over here only happens on a build without the manipulator.
      const usable = prepared.filter(
        (photo) =>
          ACCEPTED_MIME_TYPES.includes(photo.mimeType) && photo.sizeBytes <= MAX_PHOTO_BYTES,
      );
      if (usable.length < prepared.length) {
        Alert.alert(
          "Some photos were skipped",
          "Photos have to be a JPEG, PNG or WebP, under 5 MB.",
        );
      }

      reset();
      setPhotos((current) => [...current, ...usable].slice(0, MAX_POST_PHOTOS));
    } catch {
      Alert.alert("Couldn't add those photos", "Try picking them again.");
    } finally {
      setPreparing(false);
    }
  };

  const removePhoto = (uri: string) => {
    reset();
    setPhotos((current) => current.filter((photo) => photo.uri !== uri));
  };

  const submit = async () => {
    if (!canSubmit) return;

    const created = await createPost({
      title,
      caption,
      photos,
      sessionId: session?.id,
      routineId: routine?.id,
    });
    // A null result means the hook has set `error`, which is already on screen.
    if (created) router.back();
  };

  return (
    <LinearGradient
      colors={colors.gradients.background}
      style={newPostStyles.container}
    >
      <StatusBar
        barStyle={colors.statusBarStyle}
        translucent
        backgroundColor="transparent"
      />
      <SafeAreaView
        style={newPostStyles.safeArea}
        edges={["top", "left", "right"]}
      >
        <Pressable
          // insets.top by hand, as on the post detail screen: SafeAreaView's
          // top padding does not move an absolutely positioned child, so a bare
          // top: 8 put this button under the status bar.
          style={[newPostStyles.exit, { top: insets.top + 8 }]}
          onPress={leave}
          disabled={isDiscarding}
          accessibilityRole="button"
          accessibilityLabel={finishedId ? "Discard session" : "Discard post"}
          accessibilityState={{ disabled: isDiscarding, busy: isDiscarding }}
        >
          <Feather name="x" size={EXIT_ICON_SIZE} color={colors.danger} />
        </Pressable>

        <ScrollView
          contentContainerStyle={[
            newPostStyles.scrollContent,
            // Clears the pinned footer, which floats over this scroller.
            { paddingBottom: 40 + 66 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Dragging the form puts the keyboard away too, so it is never the
          // only thing standing between the user and the Post button.
          keyboardDismissMode="on-drag"
        >
          <View>
            {/*
              multiline so a long title wraps, but Return closes the keyboard
              rather than adding a line - the keyboard otherwise had no way to
              go away and sat over the Post button.
            */}
            <TextInput
              style={newPostStyles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="New post"
              placeholderTextColor={colors.textMuted}
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              maxLength={MAX_TITLE_LENGTH}
              accessibilityLabel="Post title"
            />
            <Text style={newPostStyles.counter}>
              {title.length} / {MAX_TITLE_LENGTH}
            </Text>
          </View>

          {/* What the post is about, up top - the way Hevy opens its save
              screen with the workout's numbers. */}
          {finishedId ? (
            <View style={newPostStyles.sessionStats}>
              <Text style={newPostStyles.sessionStatLabel}>Duration</Text>
              <Text style={newPostStyles.sessionStatValue}>
                {finished ? formatSeconds(finished.totalSec) : NONE}
              </Text>
            </View>
          ) : null}

          <View style={newPostStyles.section}>
            <Text style={newPostStyles.sectionTitle}>Photos</Text>

            {photos.length === 0 ? (
              <Pressable
                style={newPostStyles.photoWell}
                onPress={pickPhotos}
                disabled={preparing}
                accessibilityRole="button"
                accessibilityLabel="Add photos"
              >
                {preparing ? (
                  <ActivityIndicator color={colors.textMuted} />
                ) : (
                  <>
                    <Feather name="camera" size={28} color={colors.textMuted} />
                    <Text style={newPostStyles.photoPrompt}>Add photos</Text>
                    <Text style={newPostStyles.photoHint}>
                      Up to {MAX_POST_PHOTOS} - JPEG, PNG or WebP
                    </Text>
                  </>
                )}
              </Pressable>
            ) : (
              <View style={newPostStyles.photoStrip}>
                {photos.map((photo, index) => (
                  <View key={photo.uri} style={newPostStyles.thumb}>
                    <Image
                      style={newPostStyles.thumbImage}
                      source={{ uri: photo.uri }}
                      resizeMode="cover"
                      accessibilityLabel={`Photo ${index + 1}`}
                    />
                    <Pressable
                      style={newPostStyles.thumbRemove}
                      onPress={() => removePhoto(photo.uri)}
                      disabled={isSubmitting}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photo ${index + 1}`}
                    >
                      <Feather name="x" size={14} color={colors.text} />
                    </Pressable>
                  </View>
                ))}
                {room > 0 ? (
                  <Pressable
                    style={newPostStyles.addTile}
                    onPress={pickPhotos}
                    disabled={preparing || isSubmitting}
                    accessibilityRole="button"
                    accessibilityLabel={`Add photos, ${room} more allowed`}
                  >
                    {preparing ? (
                      <ActivityIndicator color={colors.textMuted} />
                    ) : (
                      <>
                        <Feather name="plus" size={22} color={colors.textMuted} />
                        <Text style={newPostStyles.addTileLabel}>Add</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>

          <View style={newPostStyles.section}>
            <View style={newPostStyles.fieldHeader}>
              <View style={newPostStyles.fieldLabelRow}>
                <Text style={newPostStyles.fieldLabel}>Caption</Text>
              </View>
              <Text style={newPostStyles.counter}>
                {caption.length} / {MAX_CAPTION_LENGTH}
              </Text>
            </View>

            <TextInput
              style={newPostStyles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder="How did the session go?"
              placeholderTextColor={colors.textMuted}
              multiline
              // Return closes the keyboard here too, for the title's reason.
              // The cost is no line breaks in a caption; the text still wraps.
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              maxLength={MAX_CAPTION_LENGTH}
              accessibilityLabel="Caption"
            />
          </View>

          {/*
            Both optional, and either, both or neither may be set. Only the
            user's own sessions and routines are offered - linking anyone
            else's is a 403 - and the pickers load only when opened.

            No session row when this screen was opened for a session that just
            ended: that session is what the post is about, and its duration is
            already at the top. Swapping it for another would leave the one
            just studied posted nowhere.
          */}
          <View style={newPostStyles.section}>
            <Text style={newPostStyles.sectionTitle}>Links</Text>

            <LinearGradient
              style={newPostStyles.sectionCard}
              colors={colors.gradients.surface}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            >
              {finishedId ? null : (
                <LinkRow
                  icon="clock"
                  label="Link a session"
                  hint="Adds time and focus to your post"
                  choice={session}
                  onPress={() => setPicker("session")}
                  onClear={() => setSession(null)}
                />
              )}
              <LinkRow
                icon="repeat"
                label="Link a routine"
                hint="Lets others see what you worked through"
                choice={routine}
                onPress={() => setPicker("routine")}
                onClear={() => setRoutine(null)}
                divider={!finishedId}
              />
            </LinearGradient>
          </View>

          {error || ratingError || discardError ? (
            <View style={newPostStyles.error}>
              <Feather name="alert-circle" size={18} color={colors.danger} />
              <Text style={newPostStyles.errorText}>
                {error ?? discardError ?? ratingError}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <Animated.View
          ref={footer}
          style={[
            newPostStyles.footer,
            {
              // marginBottom rather than a transform, for post/[id]'s reason:
              // it shortens the form above, so the field being typed in stays
              // in view instead of sliding under the button.
              marginBottom: keyboardLift,
              // The inset clears the home indicator, which the keyboard
              // already covers while it is up.
              paddingBottom: 12 + (isLifted ? 0 : insets.bottom),
            },
          ]}
        >
          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              newPostStyles.submit,
              !canSubmit && newPostStyles.submitDisabled,
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Publish this post"
            accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
          >
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={newPostStyles.submitFill}
            >
              {stage.step === "uploading" ? (
                // Says how far along, since four photos on a slow connection
                // can take long enough to look stuck behind a bare spinner.
                <Text style={newPostStyles.submitLabel}>
                  Uploading {Math.min(stage.done + 1, stage.total)} of {stage.total}...
                </Text>
              ) : isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={newPostStyles.submitLabel}>Post</Text>
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
        {picker === "session" ? (
          <SessionLinkPicker
            selectedId={session?.id}
            onSelect={(choice) => {
              setSession(choice);
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        ) : null}
        {picker === "routine" ? (
          <RoutineLinkPicker
            selectedId={routine?.id}
            onSelect={(choice) => {
              setRoutine(choice);
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        ) : null}

        <RatingSheet
          visible={ratingOpen}
          value={rating}
          onRate={rate}
          onClose={() => setRatingOpen(false)}
        />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default NewPost;
