import { useCallback, useEffect, useState } from "react";

import { ApiError, request } from "./api";
import { withAuth } from "./auth";
import type { PublicProfile } from "./useProfile";

export interface UserState {
  profile?: PublicProfile;
  isLoading: boolean;
  error?: string;
  reload: () => void;
}

interface Envelope {
  data: PublicProfile & Record<string, unknown>;
}

/**
 * Anyone's profile, by id - the read-only counterpart of useProfile.
 *
 * GET /api/users/:id still answers with USER_PUBLIC_SELECT, email included. The
 * fields are copied out one by one rather than spread, so the extra columns stop
 * at this file: no screen holding someone else's profile can render what it
 * was never given.
 */
export const useUser = (userId: string): UserState => {
  const [profile, setProfile] = useState<PublicProfile | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await withAuth((token) =>
        request<Envelope>(`/api/users/${userId}`, { token }),
      );
      setProfile({
        id: data.id,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        avatarUrl: data.avatarUrl,
        bio: data.bio,
      });
      setError(undefined);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This account no longer exists."
          : err instanceof Error
            ? err.message
            : "Could not load this profile.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { profile, isLoading, error, reload: load };
};
