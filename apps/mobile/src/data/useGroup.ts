import { useCallback, useEffect, useRef, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import {
  describeGroupError,
  toGroup,
  type GroupRole,
  type GroupMember,
  type LiveSession,
  type RawGroup,
  type StudyGroup,
} from "./groupTypes";

export interface GroupState {
  group?: StudyGroup;
  members?: GroupMember[];
  /** Who is studying right now. Members only - undefined for anyone else. */
  liveSessions?: LiveSession[];
  isLoading: boolean;
  loadError?: string;
  actionError?: string;
  clearActionError: () => void;
  busy: boolean;
  reload: () => void;
  /** joinCode is only read for a private group. Resolves true on success. */
  join: (joinCode?: string) => Promise<boolean>;
  leave: () => Promise<boolean>;

  // ---- admin: the API decides who may, these only ask ----------------------
  /** Name and description: owner or admin. isPrivate: owner only. */
  update: (changes: GroupEdit) => Promise<boolean>;
  /** Owner only. Retires the old code; existing members are unaffected. */
  regenerateJoinCode: () => Promise<boolean>;
  /** Owner only. Resolves true once the group is gone - leave the screen. */
  deleteGroup: () => Promise<boolean>;
  /** Owner: anyone but themselves. Admin: plain members only. */
  removeMember: (userId: string) => Promise<boolean>;
  /** Owner only. */
  setRole: (userId: string, role: GroupRole) => Promise<boolean>;
  /** Owner only, to an existing member. The owner stays on as a member. */
  transferOwnership: (userId: string) => Promise<boolean>;
}

export interface GroupEdit {
  name?: string;
  /** null clears it. */
  description?: string | null;
  isPrivate?: boolean;
}

/**
 * One group: its details, its members, and - for members - who is studying in
 * it right now.
 *
 * Join and leave reload everything rather than patching state: membership
 * changes the member list, the count AND whether live sessions are visible at
 * all, and three local patches would be three chances to drift.
 */
export const useGroup = (groupId: string | undefined): GroupState => {
  const [group, setGroup] = useState<StudyGroup | undefined>(undefined);
  const [members, setMembers] = useState<GroupMember[] | undefined>(undefined);
  const [liveSessions, setLiveSessions] = useState<LiveSession[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!groupId) return;
    const requestId = ++latest.current;
    setIsLoading(true);

    try {
      const [rawGroup, memberRows] = await Promise.all([
        withAuth((token) => request<RawGroup>(`/api/groups/${groupId}`, { token })),
        withAuth((token) =>
          request<GroupMember[]>(`/api/groups/${groupId}/members`, { token }),
        ),
      ]);
      if (requestId !== latest.current) return;

      const next = toGroup(rawGroup);
      setGroup(next);
      setMembers(memberRows);
      setLoadError(undefined);

      // Only asked for by members: anyone else is a guaranteed 403.
      if (next.isMember) {
        try {
          const live = await withAuth((token) =>
            request<LiveSession[]>(`/api/groups/${groupId}/sessions`, { token }),
          );
          if (requestId === latest.current) setLiveSessions(live);
        } catch {
          // The group is still usable without the live list; it just shows
          // nobody studying until the next refresh.
          if (requestId === latest.current) setLiveSessions([]);
        }
      } else {
        setLiveSessions(undefined);
      }
    } catch (err) {
      if (requestId !== latest.current) return;
      setLoadError(describeGroupError(err, "Could not load this group."));
    } finally {
      if (requestId === latest.current) setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const mutate = useCallback(
    async (
      path: string,
      method: string,
      body: unknown,
      fallback: string,
      reloadAfter = true,
    ) => {
      if (!groupId) return false;
      setBusy(true);
      try {
        await withAuth((token) =>
          request(`/api/groups/${groupId}${path}`, { method, token, body }),
        );
        setActionError(undefined);
        if (reloadAfter) await load();
        return true;
      } catch (err) {
        setActionError(describeGroupError(err, fallback));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [groupId, load],
  );

  const join = useCallback(
    (joinCode?: string) => {
      const code = joinCode?.trim();
      // An empty body for a public group: the schema takes joinCode as optional
      // and an empty string is not the same as none.
      return mutate("/join", "POST", code ? { joinCode: code } : {}, "Could not join the group.");
    },
    [mutate],
  );

  const leave = useCallback(
    () => mutate("/leave", "DELETE", undefined, "Could not leave the group."),
    [mutate],
  );

  const update = useCallback(
    (changes: GroupEdit) =>
      mutate("", "PATCH", changes, "Could not save the group."),
    [mutate],
  );

  const regenerateJoinCode = useCallback(
    () => mutate("/join-code", "POST", undefined, "Could not change the join code."),
    [mutate],
  );

  // No reload: the group is gone, and reading it back would only 404.
  const deleteGroup = useCallback(
    () => mutate("", "DELETE", undefined, "Could not delete the group.", false),
    [mutate],
  );

  const removeMember = useCallback(
    (userId: string) =>
      mutate(`/members/${userId}`, "DELETE", undefined, "Could not remove them."),
    [mutate],
  );

  const setRole = useCallback(
    (userId: string, role: GroupRole) =>
      mutate(`/members/${userId}/role`, "PATCH", { role }, "Could not change their role."),
    [mutate],
  );

  const transferOwnership = useCallback(
    (userId: string) =>
      mutate("/owner", "PATCH", { newOwnerId: userId }, "Could not hand over the group."),
    [mutate],
  );

  const clearActionError = useCallback(() => setActionError(undefined), []);

  return {
    group,
    members,
    liveSessions,
    isLoading,
    loadError,
    actionError,
    clearActionError,
    busy,
    reload: load,
    join,
    leave,
    update,
    regenerateJoinCode,
    deleteGroup,
    removeMember,
    setRole,
    transferOwnership,
  };
};
