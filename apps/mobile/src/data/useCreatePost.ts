import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { File } from "expo-file-system";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import { markFeedStale } from "./feedSignal";
import type { PreparedPhoto } from "./preparePhoto";

/**
 * What the API accepts, mirrored here so the screen can reject early. The API
 * cannot import from @stdyapp/shared (it is TypeScript), so these are copies:
 * MAX_POST_PHOTO_BYTES and MAX_POST_PHOTOS in apps/api/src/config/upload.js.
 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_POST_PHOTOS = 4;
export const MAX_CAPTION_LENGTH = 2000;
export const MAX_TITLE_LENGTH = 100;

export interface NewPost {
  title: string;
  /** Omitted entirely when the user typed nothing - see createPost. */
  caption?: string;
  /**
   * Up to MAX_POST_PHOTOS, in display order, already through preparePhoto.
   * Optional - but a post needs photos OR a caption; the API refuses neither.
   */
  photos: PreparedPhoto[];
  /** One of the user's own sessions. Anyone else's is a 403. */
  sessionId?: string;
  /** One of the user's own routines. Anyone else's is a 403. */
  routineId?: string;
}

/** The created row, as POST /api/posts returns it - a bare object, not `{ data }`. */
export interface CreatedPost {
  id: string;
  userId: string;
  title: string;
  caption: string | null;
  createdAt: string;
}

/** Where a post is in being published, for the button to say so. */
export type CreatePostStage =
  | { step: "idle" }
  | { step: "uploading"; done: number; total: number }
  | { step: "posting" };

export interface CreatePostState {
  createPost: (post: NewPost) => Promise<CreatedPost | null>;
  isSubmitting: boolean;
  stage: CreatePostStage;
  /** The API's own wording where there is any - it is more use than "failed". */
  error?: string;
  reset: () => void;
}

/** One answer from POST /api/posts/photos. */
interface PhotoUpload {
  photoId: string;
  uploadUrl: string;
  contentType: string;
}

/** An upload to storage that did not succeed - worded here, not by the API. */
class StorageUploadError extends Error {}

/**
 * PUTs one photo straight to R2 through its presigned URL.
 *
 * NOT through request(): that adds the API's auth and tunnel headers, and an
 * access token has no business being sent to a storage bucket. The
 * Content-Type must be exactly the one the URL was signed for, or R2 refuses.
 *
 * A phone streams the file from disk (File.upload), so a photo is never held
 * whole in JavaScript memory. Web reads the picker's blob: URL into a Blob - the
 * expo-file-system File is a stub there - which needs the bucket's CORS rule to
 * allow PUT from the app's origin.
 */
const putToStorage = async (upload: PhotoUpload, photo: PreparedPhoto): Promise<void> => {
  const headers = { "Content-Type": upload.contentType };

  let status: number;
  try {
    if (Platform.OS === "web") {
      const blob = await (await fetch(photo.uri)).blob();
      status = (await fetch(upload.uploadUrl, { method: "PUT", headers, body: blob })).status;
    } else {
      status = (await new File(photo.uri).upload(upload.uploadUrl, { httpMethod: "PUT", headers }))
        .status;
    }
  } catch (err) {
    // Offline, a dropped connection - or, on web, a bucket whose CORS rule does
    // not allow this origin, which the browser reports as a bare network error.
    throw new StorageUploadError(err instanceof Error ? err.message : String(err));
  }

  if (status < 200 || status >= 300) {
    throw new StorageUploadError(`Storage answered ${status}`);
  }
};

/**
 * Publishes a post, photos and all.
 *
 *   1. POST /api/posts/photos - an upload URL per photo
 *   2. PUT each photo straight to R2, in parallel
 *   3. POST /api/posts - the post, naming the photos by id
 *
 * The API never handles the image bytes; it checks in step 3 that each one
 * arrived and really is an image. A text-only post skips straight to step 3.
 *
 * If step 3 fails, the uploads are simply left behind - the API's sweep
 * deletes unattached photos after an hour - and a retry uploads afresh.
 */
export const useCreatePost = (): CreatePostState => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<CreatePostStage>({ step: "idle" });
  const [error, setError] = useState<string | undefined>(undefined);

  const createPost = useCallback(async (post: NewPost) => {
    setIsSubmitting(true);
    setError(undefined);

    try {
      let photoIds: string[] | undefined;

      if (post.photos.length > 0) {
        const total = post.photos.length;
        setStage({ step: "uploading", done: 0, total });

        const { uploads } = await withAuth((token) =>
          request<{ uploads: PhotoUpload[] }>("/api/posts/photos", {
            method: "POST",
            token,
            body: {
              photos: post.photos.map(({ mimeType, sizeBytes, width, height }) => ({
                mimeType,
                sizeBytes,
                width,
                height,
              })),
            },
          }),
        );

        let done = 0;
        await Promise.all(
          uploads.map(async (upload, index) => {
            await putToStorage(upload, post.photos[index]);
            done += 1;
            setStage({ step: "uploading", done, total });
          }),
        );
        photoIds = uploads.map(({ photoId }) => photoId);
      }

      setStage({ step: "posting" });

      // Optional fields are left out rather than sent empty: an empty caption
      // is a 400 ("you typed nothing"), not "no caption".
      const caption = post.caption?.trim();
      const created = await withAuth((token) =>
        request<CreatedPost>("/api/posts", {
          method: "POST",
          token,
          body: {
            title: post.title.trim(),
            ...(caption ? { caption } : {}),
            ...(post.sessionId ? { sessionId: post.sessionId } : {}),
            ...(post.routineId ? { routineId: post.routineId } : {}),
            ...(photoIds ? { photoIds } : {}),
          },
        }),
      );

      markFeedStale();
      return created;
    } catch (err) {
      setError(describe(err));
      return null;
    } finally {
      setIsSubmitting(false);
      setStage({ step: "idle" });
    }
  }, []);

  return {
    createPost,
    isSubmitting,
    stage,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/**
 * Says what the user can do about it.
 *
 * The API's messages are good - a bad photo comes back as "Photo 2 never
 * finished uploading" - but a few situations deserve wording that says what to
 * do, particularly 502, where retrying really is the right advice.
 */
const describe = (err: unknown): string => {
  if (err instanceof StorageUploadError) {
    return "A photo didn't upload. Check your connection and try again.";
  }
  if (!(err instanceof ApiError)) return "Could not publish the post. Try again.";

  switch (err.status) {
    case 429:
      return err.retryAfter
        ? `Too many posts. Try again in ${err.retryAfter}s.`
        : "Too many posts. Try again shortly.";
    case 502:
      return "Photo storage is unavailable right now. Try again in a moment.";
    default:
      return err.message;
  }
};
