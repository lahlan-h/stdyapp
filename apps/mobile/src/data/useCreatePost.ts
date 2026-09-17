import { useCallback, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import { markFeedStale } from "./feedSignal";

/** What the API accepts, mirrored here so the screen can reject early. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_CAPTION_LENGTH = 2000;

export interface NewPostPhoto {
  uri: string;
  /** image/jpeg, image/png or image/webp. Anything else is a 415. */
  mimeType: string;
  fileName?: string;
}

export interface NewPost {
  caption: string;
  photo: NewPostPhoto;
}

/** The created row, as POST /api/posts returns it - a bare object, not `{ data }`. */
export interface CreatedPost {
  id: string;
  userId: string;
  caption: string;
  photoUrl: string;
  createdAt: string;
}

/**
 * The extension the API's magic-byte sniff will agree with.
 *
 * multer only reads the declared type to decide whether to accept the part;
 * what actually gets stored is derived from the bytes. A name that disagrees
 * with the bytes is harmless, but a missing one makes some servers drop the
 * filename entirely, so one is always sent.
 */
const fileNameFor = (photo: NewPostPhoto): string => {
  if (photo.fileName) return photo.fileName;

  const ext = photo.mimeType.split("/")[1] ?? "jpg";
  return `photo.${ext}`;
};

export interface CreatePostState {
  createPost: (post: NewPost) => Promise<CreatedPost | null>;
  isSubmitting: boolean;
  /** The API's own wording where there is any - it is more use than "failed". */
  error?: string;
  reset: () => void;
}

/**
 * Creates a post, photo and all, in one multipart request.
 *
 * The photo is mandatory: Post.photoUrl is not nullable and the route answers
 * 400 without a file part. There is no separate upload step - the API takes the
 * bytes, sniffs them, writes to R2 and inserts the row, reclaiming the object
 * if the insert fails.
 */
export const useCreatePost = (): CreatePostState => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const createPost = useCallback(async (post: NewPost) => {
    setIsSubmitting(true);
    setError(undefined);

    try {
      const formData = new FormData();

      // React Native's FormData takes this shape for a file rather than a Blob.
      // The cast is unavoidable: the DOM's FormData types have no notion of it.
      formData.append("photo", {
        uri: post.photo.uri,
        name: fileNameFor(post.photo),
        type: post.photo.mimeType,
      } as unknown as Blob);

      formData.append("caption", post.caption.trim());

      // sessionId and routineId are deliberately not sent. The schema is a
      // strictObject, so an empty string is a 400 rather than "no link", and
      // there is no picker on the screen yet to produce a real one.
      const created = await withAuth((token) =>
        request<CreatedPost>("/api/posts", {
          method: "POST",
          formData,
          token,
        }),
      );

      markFeedStale();
      return created;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? describe(err)
          : "Could not publish the post. Try again.",
      );
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    createPost,
    isSubmitting,
    error,
    reset: useCallback(() => setError(undefined), []),
  };
};

/**
 * Says what the user can do about it.
 *
 * The API's messages are good, but three of them describe a situation the user
 * can act on and deserve wording that says so - particularly 502, where
 * retrying really is the right advice rather than a platitude.
 */
const describe = (err: ApiError): string => {
  switch (err.status) {
    case 413:
      return "That photo is over 5 MB. Pick a smaller one.";
    case 415:
      return "That file is not a JPEG, PNG or WebP.";
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
