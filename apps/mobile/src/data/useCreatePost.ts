import { useCallback, useState } from "react";
import { File } from "expo-file-system";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import { markFeedStale } from "./feedSignal";

/** What the API accepts, mirrored here so the screen can reject early. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_CAPTION_LENGTH = 2000;
export const MAX_TITLE_LENGTH = 100;

export interface NewPostPhoto {
  uri: string;
  /** image/jpeg, image/png or image/webp. Anything else is a 415. */
  mimeType: string;
  fileName?: string;
}

export interface NewPost {
  title: string;
  /** Omitted entirely when the user typed nothing - see createPost. */
  caption?: string;
  photo: NewPostPhoto;
}

/** The created row, as POST /api/posts returns it - a bare object, not `{ data }`. */
export interface CreatedPost {
  id: string;
  userId: string;
  title: string;
  caption: string | null;
  photoUrl: string;
  createdAt: string;
}

/**
 * The photo as a form part this runtime will actually accept.
 *
 * Expo installs a WinterCG fetch over React Native's, and its FormData encoder
 * takes only a string, a real Blob, or something exposing bytes(). React
 * Native's classic `{ uri, name, type }` part - which is what every older
 * upload example shows - is rejected outright with "Unsupported FormDataPart
 * implementation", thrown before the request is ever sent. That failure looks
 * exactly like the server being unreachable, which is what made it confusing:
 * reads worked and only the upload died.
 *
 * expo-file-system's File satisfies that contract, and carries the two things
 * the part headers are built from: `name` becomes the filename, and `type`
 * becomes the Content-Type that multer's allowlist checks before the API
 * re-derives the real format from the bytes.
 */
const toFilePart = (photo: NewPostPhoto): File => new File(photo.uri);

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

      // Cast because expo-file-system's File implements Blob structurally
      // rather than extending it, so TypeScript's DOM lib does not see them as
      // the same type. The encoder checks the shape, not the prototype.
      formData.append("photo", toFilePart(post.photo) as unknown as Blob);

      formData.append("title", post.title.trim());

      // Appended only when there is something to send. An empty string is a
      // 400 from the strictObject schema, not "no caption" - the field has to
      // be absent, the same trap the links below document.
      const caption = post.caption?.trim();
      if (caption) formData.append("caption", caption);

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
