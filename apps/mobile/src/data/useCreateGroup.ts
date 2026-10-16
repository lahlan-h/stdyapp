import { useCallback, useState } from "react";

import { describeGroupError, type StudyGroup } from "./groupTypes";
import { markGroupChanged } from "./groupSignal";
import { createGroupRequest, type NewGroup } from "./useGroups";

export interface CreateGroupState {
  /** Resolves to the new group, or undefined with `error` set. */
  create: (group: NewGroup) => Promise<StudyGroup | undefined>;
  isCreating: boolean;
  error?: string;
}

/**
 * Makes a study group, for the Study tab's create sheet.
 *
 * The Groups view's own list creates through useGroups, which also slots the
 * new group into "Your groups"; this is the same request without a list to
 * keep, and a note left in groupSignal so that list catches up on focus.
 */
export const useCreateGroup = (): CreateGroupState => {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const create = useCallback(async (group: NewGroup) => {
    if (!group.name.trim()) return undefined;
    setIsCreating(true);
    setError(undefined);
    try {
      const created = await createGroupRequest(group);
      markGroupChanged(created.id);
      return created;
    } catch (err) {
      setError(describeGroupError(err, "Could not create the group."));
      return undefined;
    } finally {
      setIsCreating(false);
    }
  }, []);

  return { create, isCreating, error };
};
