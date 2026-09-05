/**
 * Cache TTLs and rate-limit tiers for the API.
 *
 * IMPORTANT: nothing here reads process.env at MODULE SCOPE, the rule documented
 * in ./auth.js and packages/core/src/redis.js. These are all compile-time
 * constants today, so the rule costs nothing to keep — but the moment one of
 * them becomes tunable it must become a getter function, not a module-scope
 * read, or it will be evaluated before ./env.js has loaded the root .env.
 */

/**
 * TTLs are a BACKSTOP, not the invalidation mechanism — the version counters in
 * utils/cache.js do that work, and a write is visible on the very next read.
 *
 * What the TTL actually buys is reclamation. Bumping a version ORPHANS the old
 * key rather than deleting it, so without an expiry every edit would leak a row
 * into Redis forever. It is also the ceiling on how long a stale entry can
 * survive a Redis outage, during which no invalidation can be recorded at all.
 */

// The comment thread. The shortest-lived of the shared caches because it is the
// one a user watches for their own write to appear in.
export const CACHE_TTL_THREAD_SEC = 60;

// The count + commentedByMe pair. Shorter still: it is cheap to recompute (two
// indexed queries) and the most visible if it goes stale.
export const CACHE_TTL_SUMMARY_SEC = 30;

// A single comment. The longest, because it is invalidated by an exact DEL on
// every write that touches it rather than by expiry.
export const CACHE_TTL_COMMENT_SEC = 120;

// One user's comment history — a profile tab, not a live surface.
export const CACHE_TTL_USER_LIST_SEC = 60;

/**
 * Likes.
 *
 * Separate constants rather than reusing the comment ones, even where the number
 * happens to match: they describe different surfaces, and tuning the comment
 * thread should not silently retune the heart.
 */

// The count + likedByMe pair. The shortest TTL in the file. A heart that stays
// grey after you tap it is the most visible staleness this app can produce, and
// the query behind it is two indexed lookups — cheap to get wrong, cheap to redo.
export const CACHE_TTL_LIKE_SUMMARY_SEC = 15;

// The "liked by" list. Matches the comment thread: same kind of surface, same
// tolerance for being a minute behind.
export const CACHE_TTL_LIKED_BY_SEC = 60;

// One user's like history — a profile tab, like its comment counterpart.
export const CACHE_TTL_LIKE_USER_LIST_SEC = 60;

/**
 * Rate-limit tiers, keyed on the caller's user id.
 *
 * Tiered rather than uniform because the routes cost wildly different amounts.
 * Reading a thread is a cached GET a client may fire on every scroll; wiping
 * every comment you have ever left is destructive and irreversible. One number
 * covering both would be either useless for the first or dangerous for the last.
 *
 * These are per-user ceilings on ABUSE, not a quality-of-service budget: they
 * are set well above what any legitimate client should reach, so hitting one is
 * a signal that something is wrong rather than a normal state to design around.
 */

// 120/min ≈ two reads a second sustained. A feed screen rendering many comment
// sections at once must fit inside this.
export const RATE_LIMIT_READ = { max: 120, windowSec: 60 };

// 20/min. Comfortably above a human typing comments, far below a script.
export const RATE_LIMIT_WRITE = { max: 20, windowSec: 60 };

// 5/hour. There is no legitimate reason to clear your entire comment history
// twice in a row, let alone five times, and the operation is irreversible.
export const RATE_LIMIT_BULK = { max: 5, windowSec: 3600 };

/**
 * Likes reuse RATE_LIMIT_READ and RATE_LIMIT_BULK as they stand — those tiers
 * are written as whole-API ceilings, and rateLimit()'s `name` already gives each
 * router its own Redis keyspace and therefore its own independent budget.
 *
 * The WRITE tier is the one exception. 20/min is tuned for a human typing a
 * comment; a heart is a tap. Liking is deliberately idempotent, so clients
 * retry it freely and a user scrolling a feed can legitimately fire a burst.
 * 20/min would throttle ordinary use — this is still an order of magnitude
 * below a script.
 */
export const RATE_LIMIT_LIKE_WRITE = { max: 60, windowSec: 60 };
