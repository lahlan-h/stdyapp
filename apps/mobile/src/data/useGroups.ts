import { useCallback, useEffect, useRef, useState } from "react";

import { request } from "./api";
import { withAuth } from "./auth";
import { consumeGroupChanges } from "./groupSignal";
import {
  describeGroupError,
  toGroup,
  type RawGroup,
  type StudyGroup,
} from "./groupTypes";

/** Results per page. The API's default, said out loud so the two cannot drift. */
const PAGE_SIZE = 20;

/** GET /api/groups - the user directory's envelope. */
interface GroupPage {
  data: RawGroup[];
  pagination: { page: number; hasNextPage: boolean };
}

export interface NewGroup {
  name: string;
  description?: string;
  isPrivate: boolean;
}

export interface GroupsState {
  /** The groups the user belongs to, owned ones included. */
  myGroups?: StudyGroup[];
  /** Results for the last search, every page loaded so far; undefined until one has run. */
  results?: StudyGroup[];
  /** Whether the last search has more pages to load. */
  hasMore: boolean;
  isLoading: boolean;
  /** A search or a further page is on its way. */
  isSearching: boolean;
  loadError?: string;
  /** A failed search or create. Separate from loadError so the list stays up. */
  actionError?: string;
  busy: boolean;
  reload: () => void;
  /** An empty query lists every group - the API's own "no filter". Loads page 1. */
  search: (query: string) => void;
  /** The next page of the last search, appended. */
  loadMore: () => void;
  /**
   * Brings search results up to date with what happened on a group screen:
   * deleted groups drop out, changed ones are re-read in place. Call on focus.
   */
  applyGroupChanges: () => void;
  /** Resolves to the new group, or undefined when the request failed. */
  create: (group: NewGroup) => Promise<StudyGroup | undefined>;
}

/**
 * The Study tab's Groups view: the user's own groups, and finding new ones.
 *
 * Both lists come back with isMember on every row, so a search result can say
 * "Joined" without a second request.
 */
export const useGroups = (): GroupsState => {
  const [myGroups, setMyGroups] = useState<StudyGroup[] | undefined>(undefined);
  const [results, setResults] = useState<StudyGroup[] | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  /** Drops a slow response that a newer request has already replaced. */
  const latestLoad = useRef(0);
  const latestSearch = useRef(0);
  /** The search the loaded pages belong to, and the last page loaded. */
  const searchRef = useRef({ query: "", page: 0 });

  const load = useCallback(async () => {
    const requestId = ++latestLoad.current;
    setIsLoading(true);
    try {
      const rows = await withAuth((token) =>
        request<RawGroup[]>("/api/groups/mine", { token }),
      );
      if (requestId !== latestLoad.current) return;
      setMyGroups(rows.map(toGroup));
      setLoadError(undefined);
    } catch (err) {
      if (requestId !== latestLoad.current) return;
      setLoadError(describeGroupError(err, "Could not load your groups."));
    } finally {
      if (requestId === latestLoad.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * One page of a search. Page 1 replaces the list; any later page appends, so
   * "Load more" keeps what is already on screen where it is.
   */
  const fetchPage = useCallback((query: string, page: number) => {
    const requestId = ++latestSearch.current;
    setIsSearching(true);

    void (async () => {
      try {
        // Built by hand: React Native's URLSearchParams has been incomplete
        // for most of its life, and two fixed keys do not need it.
        const qs =
          `page=${page}&limit=${PAGE_SIZE}` + (query ? `&q=${encodeURIComponent(query)}` : "");
        const body = await withAuth((token) =>
          request<GroupPage>(`/api/groups?${qs}`, { token }),
        );
        if (requestId !== latestSearch.current) return;

        const rows = body.data.map(toGroup);
        setResults((prev) => {
          if (page === 1) return rows;
          // A group created between pages can shift one already shown onto
          // the next page; keep the first copy rather than list it twice.
          const seen = new Set((prev ?? []).map((g) => g.id));
          return [...(prev ?? []), ...rows.filter((g) => !seen.has(g.id))];
        });
        setHasMore(body.pagination.hasNextPage);
        searchRef.current = { query, page };
        setActionError(undefined);
      } catch (err) {
        if (requestId !== latestSearch.current) return;
        setActionError(describeGroupError(err, "Could not search groups."));
      } finally {
        if (requestId === latestSearch.current) setIsSearching(false);
      }
    })();
  }, []);

  const search = useCallback(
    (query: string) => fetchPage(query.trim(), 1),
    [fetchPage],
  );

  const loadMore = useCallback(() => {
    const { query, page } = searchRef.current;
    if (page === 0) return;
    fetchPage(query, page + 1);
  }, [fetchPage]);

  const applyGroupChanges = useCallback(() => {
    const { deleted, changed } = consumeGroupChanges();
    if (deleted.length > 0) {
      const gone = new Set(deleted);
      setResults((prev) => prev?.filter((g) => !gone.has(g.id)));
      setMyGroups((prev) => prev?.filter((g) => !gone.has(g.id)));
    }

    for (const groupId of changed) {
      void (async () => {
        try {
          const fresh = toGroup(
            await withAuth((token) => request<RawGroup>(`/api/groups/${groupId}`, { token })),
          );
          setResults((prev) => prev?.map((g) => (g.id === groupId ? fresh : g)));
        } catch {
          // A stale row until the next search - not worth an error over.
        }
      })();
    }
  }, []);

  const create = useCallback(async ({ name, description, isPrivate }: NewGroup) => {
    const clean = name.trim();
    if (!clean) return undefined;

    setBusy(true);
    try {
      const created = await withAuth((token) =>
        request<Omit<RawGroup, "_count" | "isMember" | "isOwner" | "role">>(
          "/api/groups",
          {
            method: "POST",
            token,
            body: {
              name: clean,
              // Absent rather than "": an empty string is stored as an empty
              // description, which is not the same as none.
              ...(description?.trim() ? { description: description.trim() } : {}),
              isPrivate,
            },
          },
        ),
      );
      // POST answers the bare row. The creator is the owner and only member,
      // so these are the truth rather than a guess.
      const group: StudyGroup = {
        ...created,
        memberCount: 1,
        isMember: true,
        isOwner: true,
        // createGroup adds the owner with the default role; ownership is
        // ownerId, not a role.
        role: "MEMBER",
      };
      setMyGroups((prev) =>
        [...(prev ?? []), group].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setActionError(undefined);
      return group;
    } catch (err) {
      setActionError(describeGroupError(err, "Could not create the group."));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    myGroups,
    results,
    hasMore,
    isLoading,
    isSearching,
    loadError,
    actionError,
    busy,
    reload: load,
    search,
    loadMore,
    applyGroupChanges,
    create,
  };
};
