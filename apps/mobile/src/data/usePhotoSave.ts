import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { File, Paths } from "expo-file-system";
import * as WebBrowser from "expo-web-browser";
import type * as MediaLibraryModule from "expo-media-library";

/**
 * idle    - nothing yet, or the last result has been cleared
 * saving  - in flight
 * saved   - in the photo library (phone) or downloaded (web)
 * opened  - the photo was opened in a browser for the user to save from there:
 *           on web when the bucket will not hand over the bytes, and on a phone
 *           whose build predates expo-media-library (see mediaLibrary below)
 * error   - see `error`
 */
export type PhotoSaveStatus = "idle" | "saving" | "saved" | "opened" | "error";

export interface PhotoSaveState {
  save: (url: string) => Promise<void>;
  status: PhotoSaveStatus;
  error?: string;
  reset: () => void;
}

const DENIED =
  "stdy needs permission to add photos. You can allow it in your phone's Settings.";
const FAILED = "Could not save the photo. Try again.";

/**
 * expo-media-library, loaded on first use - or null when this build of the app
 * does not contain its native half.
 *
 * ⚠ NEVER IMPORT IT AT THE TOP OF A FILE. Its JavaScript calls
 * requireNativeModule("ExpoMediaLibraryNext") as it loads, which THROWS in a
 * development build compiled before the package was added. Through the
 * src/data barrel that one throw took down every route in the app at launch.
 * So: ask whether the native module exists (requireOptionalNativeModule
 * answers null rather than throwing), and require the package only then.
 *
 * Rebuilding the development build (npx expo run:android / run:ios, or an EAS
 * development build) brings the module in and the real save takes over.
 */
let mediaLibrary: typeof MediaLibraryModule | null | undefined;

const getMediaLibrary = (): typeof MediaLibraryModule | null => {
  if (mediaLibrary === undefined) {
    mediaLibrary = requireOptionalNativeModule("ExpoMediaLibraryNext")
      ? (require("expo-media-library") as typeof MediaLibraryModule)
      : null;
  }
  return mediaLibrary;
};

/** The last path segment - "<uuid>.jpg" for a post photo. */
const fileNameOf = (url: string): string => {
  try {
    return new URL(url).pathname.split("/").pop() || "stdy-photo.jpg";
  } catch {
    return "stdy-photo.jpg";
  }
};

/**
 * Phone: download to the cache, then add to the photo library - or, on a build
 * without the media library, open the photo in the in-app browser, where
 * press-and-hold offers Save on both iOS and Android.
 *
 * WRITE-ONLY permission, and photos only: saving needs no right to read the
 * library, and asking for less is both kinder and likelier to be granted.
 * Asset.create copies the file in, so the cached download is removed after.
 */
const saveNative = async (url: string): Promise<"saved" | "opened"> => {
  const MediaLibrary = getMediaLibrary();
  if (!MediaLibrary) {
    await WebBrowser.openBrowserAsync(url);
    return "opened";
  }

  const { granted } = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
  if (!granted) throw new Error(DENIED);

  // idempotent: saving the same photo twice overwrites the cached copy rather
  // than throwing "already exists".
  const file = await File.downloadFileAsync(url, Paths.cache, { idempotent: true });
  try {
    await MediaLibrary.Asset.create(file.uri);
  } finally {
    try {
      file.delete();
    } catch {
      /* the cache is the system's to clear anyway */
    }
  }
  return "saved";
};

/**
 * Web: fetch the bytes and hand them to the browser as a download.
 *
 * A plain <a download> is ignored for a cross-origin URL - which photo storage
 * is - so the bytes have to come through fetch first. That needs the bucket to
 * allow this origin (CORS); when it does not, the photo opens in a new tab
 * instead, where the browser's own Save works.
 */
const saveWeb = async (url: string): Promise<"saved" | "opened"> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const href = URL.createObjectURL(await response.blob());

    const link = document.createElement("a");
    link.href = href;
    link.download = fileNameOf(url);
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Not revoked synchronously: some browsers start the download after click()
    // returns, and a revoked URL gives them nothing to download.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return "saved";
  } catch {
    window.open(url, "_blank", "noopener");
    return "opened";
  }
};

/** Saves a post's photo to the device - the photo viewer's download button. */
export const usePhotoSave = (): PhotoSaveState => {
  const [status, setStatus] = useState<PhotoSaveStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const save = useCallback(async (url: string) => {
    setStatus("saving");
    setError(undefined);
    try {
      setStatus(Platform.OS === "web" ? await saveWeb(url) : await saveNative(url));
    } catch (err) {
      setError(err instanceof Error && err.message === DENIED ? DENIED : FAILED);
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(undefined);
  }, []);

  return { save, status, error, reset };
};
