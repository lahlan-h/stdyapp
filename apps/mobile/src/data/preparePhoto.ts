import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { File } from "expo-file-system";
import type * as ImageManipulatorModule from "expo-image-manipulator";

/**
 * A photo ready to upload: shrunk, in a format the API takes, and measured.
 *
 * width / height travel with it to the API, so the feed can size the photo's
 * frame before the image loads. sizeBytes is checked by the API before it signs
 * an upload URL - and checked again, for real, once the bytes have arrived.
 */
export interface PreparedPhoto {
  uri: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * The longest side a post photo is stored at. A phone screen is around 1200
 * physical pixels wide and the full-size viewer zooms to 4x of the fitted
 * width, so 2048 keeps text in a photo of notes readable while cutting a
 * 12-megapixel original to about a third of its pixels.
 */
const MAX_EDGE = 2048;
/** JPEG quality on re-encode - visually lossless at this size, a few hundred KB. */
const QUALITY = 0.8;

/**
 * expo-image-manipulator, loaded on first use - or null when this build of the
 * app does not contain its native half.
 *
 * ⚠ NEVER IMPORT IT AT THE TOP OF A FILE, for usePhotoSave's reason: its
 * JavaScript calls requireNativeModule as it loads, which throws in a
 * development build compiled before the package was added - and through the
 * src/data barrel, that takes down every screen. Web has its own
 * implementation, so it is always there.
 */
let manipulator: typeof ImageManipulatorModule | null | undefined;

const getManipulator = (): typeof ImageManipulatorModule | null => {
  if (manipulator === undefined) {
    const available =
      Platform.OS === "web" || requireOptionalNativeModule("ExpoImageManipulator") !== null;
    manipulator = available
      ? (require("expo-image-manipulator") as typeof ImageManipulatorModule)
      : null;
  }
  return manipulator;
};

/** The file's size in bytes - from disk on a phone, from its Blob on web. */
const sizeOf = async (uri: string): Promise<number> => {
  if (Platform.OS === "web") return (await (await fetch(uri)).blob()).size;
  return new File(uri).size ?? 0;
};

/**
 * Shrinks a picked photo to MAX_EDGE on its longest side and re-encodes it as
 * JPEG, so four photos upload in seconds rather than minutes and the feed
 * downloads a few hundred KB per photo rather than several MB.
 *
 * Re-encoding also converts what the API refuses into what it takes: an
 * Android phone set to save HEIF comes out as a JPEG here.
 *
 * Without the image manipulator (an older development build) the photo is
 * passed through untouched, at its own size and type - the API's own limits
 * still apply, and the compose screen reports them.
 */
export const preparePhoto = async (picked: {
  uri: string;
  width: number;
  height: number;
  mimeType?: string | null;
}): Promise<PreparedPhoto> => {
  const ImageManipulator = getManipulator();

  if (!ImageManipulator) {
    return {
      uri: picked.uri,
      mimeType: picked.mimeType ?? "image/jpeg",
      width: picked.width,
      height: picked.height,
      sizeBytes: await sizeOf(picked.uri),
    };
  }

  const longest = Math.max(picked.width, picked.height);
  const context = ImageManipulator.ImageManipulator.manipulate(picked.uri);
  if (longest > MAX_EDGE) {
    // One side only; the manipulator keeps the aspect ratio.
    context.resize(picked.width >= picked.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }

  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    compress: QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    uri: saved.uri,
    mimeType: "image/jpeg",
    width: saved.width,
    height: saved.height,
    sizeBytes: await sizeOf(saved.uri),
  };
};
