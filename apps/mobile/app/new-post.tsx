import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Feather from "@expo/vector-icons/Feather";

import {
  useTheme,
  useNewPostStyles,
  EXIT_ICON_SIZE,
  NEW_POST_ROW_ICON_SIZE,
} from "@theme";
import {
  useCreatePost,
  MAX_PHOTO_BYTES,
  MAX_CAPTION_LENGTH,
  MAX_TITLE_LENGTH,
  type NewPostPhoto,
} from "@data";

/** What the API's magic-byte sniff will accept. GIF is deliberately not in it. */
const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Compose a post.
 *
 * Presented as a modal from the tab bar's centre button. A photo and a title
 * are required - Post.photoUrl is not nullable, so there is no text-only post
 * to fall back to - and the caption is the optional half.
 */
const NewPost = () => {
  const { colors } = useTheme();
  const newPostStyles = useNewPostStyles();
  const insets = useSafeAreaInsets();
  const { createPost, isSubmitting, error, reset } = useCreatePost();

  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [photo, setPhoto] = useState<NewPostPhoto | null>(null);

  const canSubmit = Boolean(photo) && title.trim().length > 0 && !isSubmitting;

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photos are off",
        "stdy needs access to your photos to attach one to a post. Turn it on in Settings.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // Square, because that is how the feed crops it - what you pick here is
      // what everyone else sees.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "image/jpeg";

    // Checked here rather than letting the upload fail: a rejected 5 MB photo
    // costs the user the whole upload before telling them anything.
    if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
      Alert.alert("Unsupported image", "Pick a JPEG, PNG or WebP.");
      return;
    }

    if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
      Alert.alert("Photo too large", "Photos have to be under 5 MB.");
      return;
    }

    reset();
    setPhoto({ uri: asset.uri, mimeType, fileName: asset.fileName ?? undefined });
  };

  const submit = async () => {
    if (!photo) return;

    const created = await createPost({ title, caption, photo });
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
          style={[newPostStyles.exit, { top: 8 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Discard post"
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
        >
          <View>
            <TextInput
              style={newPostStyles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="New post"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={MAX_TITLE_LENGTH}
              accessibilityLabel="Post title"
            />
            <Text style={newPostStyles.counter}>
              {title.length} / {MAX_TITLE_LENGTH}
            </Text>
          </View>

          <View style={newPostStyles.section}>
            <Text style={newPostStyles.sectionTitle}>Photo</Text>

            <Pressable
              style={newPostStyles.photoWell}
              onPress={pickPhoto}
              accessibilityRole="button"
              accessibilityLabel={photo ? "Change photo" : "Add a photo"}
            >
              {photo ? (
                <>
                  <Image
                    style={newPostStyles.photo}
                    source={{ uri: photo.uri }}
                    resizeMode="cover"
                  />
                  <View style={newPostStyles.photoChange}>
                    <Feather name="camera" size={16} color={colors.text} />
                    <Text style={newPostStyles.photoChangeLabel}>Change</Text>
                  </View>
                </>
              ) : (
                <>
                  <Feather name="camera" size={28} color={colors.textMuted} />
                  <Text style={newPostStyles.photoPrompt}>Add a photo</Text>
                  <Text style={newPostStyles.photoHint}>
                    JPEG, PNG or WebP, up to 5 MB
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={newPostStyles.section}>
            <View style={newPostStyles.fieldHeader}>
              <View style={newPostStyles.fieldLabelRow}>
                <Text style={newPostStyles.fieldLabel}>Caption</Text>
                <View style={newPostStyles.badge}>
                  <Text style={newPostStyles.badgeText}>OPTIONAL</Text>
                </View>
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
              maxLength={MAX_CAPTION_LENGTH}
              accessibilityLabel="Caption"
            />
          </View>

          {/*
            Laid out now so the screen is complete, and marked inert so neither
            the user nor the next dev mistakes a row for a working control.
            Linking needs a picker fed by GET /api/sessions, and sending an id
            you do not own is a 403.
          */}
          <View style={newPostStyles.section}>
            <Text style={newPostStyles.sectionTitle}>Links</Text>

            <LinearGradient
              style={newPostStyles.sectionCard}
              colors={colors.gradients.surface}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            >
              <View style={[newPostStyles.row, newPostStyles.rowDisabled]}>
                <View style={newPostStyles.rowIconBox}>
                  <Feather
                    name="clock"
                    size={NEW_POST_ROW_ICON_SIZE}
                    color={colors.textMuted}
                  />
                </View>
                <View style={newPostStyles.rowText}>
                  <Text style={newPostStyles.rowLabel}>Link a session</Text>
                  <Text style={newPostStyles.rowValue}>
                    Adds time and focus to your post
                  </Text>
                </View>
                <View style={newPostStyles.badge}>
                  <Text style={newPostStyles.badgeText}>SOON</Text>
                </View>
              </View>

              <View
                style={[
                  newPostStyles.row,
                  newPostStyles.rowDivider,
                  newPostStyles.rowDisabled,
                ]}
              >
                <View style={newPostStyles.rowIconBox}>
                  <Feather
                    name="repeat"
                    size={NEW_POST_ROW_ICON_SIZE}
                    color={colors.textMuted}
                  />
                </View>
                <View style={newPostStyles.rowText}>
                  <Text style={newPostStyles.rowLabel}>Link a routine</Text>
                </View>
                <View style={newPostStyles.badge}>
                  <Text style={newPostStyles.badgeText}>SOON</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {error ? (
            <View style={newPostStyles.error}>
              <Feather name="alert-circle" size={18} color={colors.danger} />
              <Text style={newPostStyles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            newPostStyles.footer,
            { paddingBottom: 12 + insets.bottom },
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
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={newPostStyles.submitLabel}>Post</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default NewPost;
