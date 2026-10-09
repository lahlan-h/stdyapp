import { request } from "./api";
import { isSignedIn, withAuth } from "./auth";
import { toNotification, type RawNotification } from "./notificationMapping";
import * as notificationStore from "./notificationStore";

/**
 * How many notifications the page shows. One read, no paging: the page is a
 * glance at what is new, and fifty is more than anyone scrolls through before
 * clearing them.
 */
const PAGE_SIZE = 50;

interface ListResponse {
  items: RawNotification[];
  total: number;
  page: number;
  limit: number;
}

interface UnreadResponse {
  unread: number;
}

/**
 * Reads the first page and the unread count into the store.
 *
 * Called on first use and again every time the socket (re)connects. That second
 * call is what makes the socket safe to lose: anything raised while it was down
 * - the app backgrounded, a tunnel, a deploy - is in this read, so events only
 * ever have to cover the time the socket is actually open.
 *
 * Both reads go out together, and the result is dropped if the user signed out
 * while they were in flight, so one account's list can never land in the next
 * account's store.
 */
export const loadNotifications = async (): Promise<void> => {
  const [list, count] = await Promise.all([
    withAuth((token) =>
      request<ListResponse>(`/api/notifications?limit=${PAGE_SIZE}`, { token }),
    ),
    withAuth((token) =>
      request<UnreadResponse>("/api/notifications/unread-count", { token }),
    ),
  ]);
  if (!isSignedIn()) return;
  notificationStore.setAll(list.items.map(toNotification), count.unread);
};
