import type { ColorScheme } from "./colors";
import { StyleSheet } from "react-native";

/** Diameter of the viewer's round buttons, and their glyph. */
const CONTROL_SIZE = 44;
const PHOTO_VIEWER_ICON_SIZE = 20;

/**
 * The full-screen photo viewer: the photo on black, with close and save
 * buttons floating over it and a status line along the bottom. Every colour is
 * a lightbox token - the same in both themes, see colors.ts.
 */
export const createPhotoViewerStyles = (colors: ColorScheme) => {
  const styles = StyleSheet.create({
    root: { flex: 1 },
    // Its own layer, so a drag-to-close can fade it while the photo moves.
    backdrop: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.lightbox.bg,
    },
    stage: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    photo: {
      width: "100%",
      height: "100%",
    },

    // --- Controls ---
    topBar: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 16,
    },
    control: {
      width: CONTROL_SIZE,
      height: CONTROL_SIZE,
      borderRadius: CONTROL_SIZE / 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.lightbox.control,
    },
    controlBusy: { opacity: 0.6 },
    // "2 / 4", between the two buttons, on a post with several photos.
    counter: {
      alignSelf: "center",
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 15,
      color: colors.lightbox.text,
    },

    // --- Status ("Saved to Photos", an error) ---
    status: {
      position: "absolute",
      alignSelf: "center",
      maxWidth: "90%",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: colors.lightbox.control,
    },
    statusText: {
      fontFamily: "PlusJakartaSans_600SemiBold",
      fontSize: 14,
      textAlign: "center",
      color: colors.lightbox.text,
    },
  });
  return styles;
};

export { PHOTO_VIEWER_ICON_SIZE };
