import { useCallback, useEffect, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import { markFeedStale } from "./feedSignal";

/**
 * Mirrors the API's user.validation.js, so the screen can stop a 400 early.
 * The name and username caps are shared with sign-up, so they live in
 * registrationChecks.ts rather than here.
 */
export const MAX_BIO_LENGTH = 500;
export const MIN_USERNAME_LENGTH = 3;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * The signed-in user, as GET /api/auth/me answers it (USER_PUBLIC_SELECT).
 * Only the fields a screen reads are listed.
 */
export interface Profile {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isPrivate: boolean;
}

/**
 * What the edit screen may change.
 *
 * email is left out on purpose: it is the login identifier, and changing it
 * with nothing but a live access token is the same risk the API's
 * updateUserSchema gives for leaving password out. avatarUrl is not client
 * input at all - it goes through PUT /api/users/:id/photo. isPrivate is left
 * out until the API enforces it: today it is stored and read by nothing, so a
 * switch for it would promise privacy the app does not give.
 */
export type ProfileEdit = Partial<
  Pick<Profile, "username" | "firstName" | "lastName" | "bio">
>;

export interface ProfileState {
  profile?: Profile;
  isLoading: boolean;
  loadError?: string;
  reload: () => void;
  /** Resolves true when saved. Sends only the fields passed in. */
  save: (edit: ProfileEdit) => Promise<boolean>;
  isSaving: boolean;
  saveError?: string;
  resetSaveError: () => void;
}

interface Envelope {
  data: Profile;
}

/**
 * Reads and edits the signed-in user.
 *
 * GET /api/auth/me rather than GET /api/users/:id: the id is not needed, and
 * the controller answers with the same shape either way. The write needs the
 * id, and takes it from the profile it just read, so the PATCH can never
 * target a different account than the one on screen.
 *
 * PESSIMISTIC, like useReportPost: the screen shows a spinner, so nothing
 * changes until the server agrees.
 */
export const useProfile = (): ProfileState => {
  const [profile, setProfile] = useState<Profile | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await withAuth((token) =>
        request<Envelope>("/api/auth/me", { token }),
      );
      setProfile(data);
      setLoadError(undefined);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your profile.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (edit: ProfileEdit) => {
      if (!profile) return false;

      // updateUserSchema refuses an empty body, so do not send one.
      if (Object.keys(edit).length === 0) return true;

      setIsSaving(true);
      setSaveError(undefined);
      try {
        const { data } = await withAuth((token) =>
          request<Envelope>(`/api/users/${profile.id}`, {
            method: "PATCH",
            body: edit,
            token,
          }),
        );
        setProfile(data);
        // Names and usernames are embedded in every feed row this user wrote.
        markFeedStale();
        return true;
      } catch (err) {
        setSaveError(describe(err));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [profile],
  );

  return {
    profile,
    isLoading,
    loadError,
    reload: load,
    save,
    isSaving,
    saveError,
    resetSaveError: useCallback(() => setSaveError(undefined), []),
  };
};

const describe = (err: unknown): string => {
  if (!(err instanceof ApiError)) return "Could not save your profile. Try again.";

  switch (err.status) {
    case 409:
      return "That username is taken.";
    case 429:
      return err.retryAfter
        ? `Too many changes. Try again in ${err.retryAfter}s.`
        : "Too many changes. Try again shortly.";
    default:
      return err.message;
  }
};