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
 * Follows.
 *
 * Separate constants again, for the reason the like block gives: they describe a
 * different surface, and tuning the heart should not silently retune a Follow
 * button.
 */

// The counts + followedByMe/followsMe bundle. Matches the like summary, and for
// the same reason: a Follow button that still says "Follow" after you tap it is
// the most visible staleness this feature can produce, and the query behind it
// is four indexed lookups — cheap to get wrong, cheap to redo.
export const CACHE_TTL_FOLLOW_SUMMARY_SEC = 15;

// The follower and following lists, which share one TTL because they are the
// same surface pointed two ways. Matches every other profile tab in this file.
export const CACHE_TTL_FOLLOW_LIST_SEC = 60;

/**
 * Blocks.
 *
 * Separate constants again, per the rule this file states throughout. These are
 * also the only PRIVATE cached payloads in the API besides a single post, which
 * is why both sit at the short end: a stale entry here is a caller looking at
 * their own out-of-date list, and the queries behind both are single indexed
 * lookups — cheap to get wrong, cheap to redo.
 */

// The caller's own block list. Matches every other profile-tab TTL in this file.
export const CACHE_TTL_BLOCK_LIST_SEC = 60;

// blockedByMe for one target. Matches the like and follow summaries, and for the
// same reason: a Block menu item that still says "Block" after you tap it is the
// most visible staleness this feature can produce.
export const CACHE_TTL_BLOCK_STATUS_SEC = 15;

/**
 * Posts.
 *
 * Separate constants again, for the reason the like block gives: these describe
 * a different surface, and retuning the comment thread should not silently
 * retune a profile grid.
 */

// A single post, and the only per-viewer payload here that is also owner-only.
// The longest of the three because the sole caller who can read it is the same
// person whose writes bump its counter — staleness is self-inflicted and
// corrected on the very next read.
export const CACHE_TTL_POST_SEC = 120;

// One user's posts, shared by GET / and GET /user/:userId. Matches its comment
// and like counterparts exactly: a profile tab, not a live surface.
export const CACHE_TTL_POST_USER_LIST_SEC = 60;

/**
 * Users.
 *
 * Separate constant again, for the reason the like and post blocks give, and
 * only one of them: GET /api/users/:id is the single cached read in that
 * router. The paginated directory at GET /api/users is deliberately uncached,
 * exactly as GET /all is in the three routers above — every user write anywhere
 * would invalidate the whole thing, and its ?q is unbounded client input, so a
 * cache there would thrash and grow without bound at once.
 */

// One user profile. The longest TTL here alongside the single post, and the
// safest: a profile is the most static row in the app, and every write that can
// change it now bumps its counter, so the expiry is purely reclamation rather
// than the staleness ceiling it is for the shared surfaces above.
export const CACHE_TTL_USER_SEC = 120;

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

/**
 * Follows reuse RATE_LIMIT_READ and RATE_LIMIT_BULK as they stand, and add one
 * tier of their own — landing deliberately BETWEEN the two write tiers above.
 *
 * 20/min (RATE_LIMIT_WRITE) is tuned for a human typing a comment, and an
 * onboarding "follow these people to get started" screen legitimately exceeds
 * it: the whole point of that flow is a burst.
 *
 * 60/min (RATE_LIMIT_LIKE_WRITE) is tuned for a reflexively tapped heart fired
 * on every scroll, which a follow is not — it is a deliberate choice about
 * someone's feed, made once per person.
 *
 * 30/min clears the burst and stays an order of magnitude below a script walking
 * a user directory, which is the abuse this actually bounds.
 */
export const RATE_LIMIT_FOLLOW_WRITE = { max: 30, windowSec: 60 };

/**
 * Blocks reuse all three base tiers unchanged and add none of their own — the
 * call the post and user blocks make rather than the one follows made.
 *
 * RATE_LIMIT_FOLLOW_WRITE exists because an onboarding "follow these people to
 * get started" screen is legitimately a burst. Nothing bulk-blocks: a block is
 * the most deliberate action in the app, made once per person, after a decision
 * about that person. 20/min is exactly the tier RATE_LIMIT_WRITE was written for,
 * and rateLimit()'s `name` already gives this router its own Redis keyspace, so
 * the budget is independent of every other router despite sharing the number.
 *
 * DELETE /api/blocks/mine sits on RATE_LIMIT_BULK for the reason every bulk
 * delete does: there is no legitimate reason to unblock everyone five times in an
 * hour, and it is irreversible in a way the follow equivalent is not — the follow
 * edges those blocks severed do not come back.
 */

/**
 * Posts reuse all three base tiers unchanged, and add none of their own.
 *
 * RATE_LIMIT_WRITE is the right one for a post rather than RATE_LIMIT_LIKE_WRITE:
 * composing a caption and attaching a photo is the deliberate, typed action the
 * 20/min tier was written for, not the reflexive tap that made likes an
 * exception. As with likes, rateLimit()'s `name` gives the post router its own
 * Redis keyspace, so these budgets are independent of the comment and like
 * routers despite sharing the numbers.
 */

/**
 * Users reuse all three base tiers unchanged, adding none of their own, for the
 * reason the post block gives: rateLimit()'s `name` gives the user router its
 * own Redis keyspace, so these budgets are independent of the comment, like and
 * post routers despite sharing the numbers.
 *
 * Uploading an avatar is the exception that needed its own tier - see
 * RATE_LIMIT_AVATAR_WRITE below.
 *
 * The one placement worth stating is DELETE /api/users/:id on RATE_LIMIT_BULK
 * rather than RATE_LIMIT_WRITE. It is not a bulk operation by row count — it
 * deletes exactly one — but it is the most destructive and least reversible
 * call in the API, and 5/hour is the tier this codebase already reserves for
 * that. A caller can only succeed once, and 5 attempts still leaves room to
 * retry after the 409 that a user with study sessions gets.
 */

/**
 * Avatar uploads. The only tier defined in terms of BYTES rather than rows.
 *
 * Tighter than RATE_LIMIT_WRITE because the two are not comparable costs.
 * 20/min is tuned for a JSON PATCH of a few hundred bytes; the same budget on
 * PUT /api/users/:id/photo would let one user push 100 MB a minute through the
 * process memory of the API and into the bucket, where every object also costs
 * money to store until something reclaims it.
 *
 * 10/min is still far above legitimate use - nobody picks a profile picture ten
 * times a minute - which is the standard this file sets for every tier: a
 * ceiling on abuse, not a quality-of-service budget.
 *
 * DELETE on that same route deliberately stays on RATE_LIMIT_WRITE. It carries
 * no body and costs one row plus one object delete, so there is nothing here to
 * bound.
 */
export const RATE_LIMIT_AVATAR_WRITE = { max: 10, windowSec: 60 };

/**
 * Creating a post - POST /api/posts, which now carries the photo itself.
 *
 * Replaces RATE_LIMIT_WRITE on that route. 20/min is tuned for a JSON body of a
 * few hundred bytes; the same budget against a 5 MB multipart upload is 100 MB a
 * minute of bandwidth, process memory and bucket writes from a single account.
 *
 * A separate tier from RATE_LIMIT_AVATAR_WRITE despite the identical numbers,
 * per the rule this file states throughout - and here the surfaces really do
 * differ in the one way that matters for storage. An avatar upload DELETES the
 * previous object, so a user occupies about one object however often they change
 * their picture. Posts accumulate by design: every one keeps its photo until the
 * post itself is deleted. So the same number bounds a bounded thing in one case
 * and an unbounded one in the other, and the two must be free to diverge.
 */
export const RATE_LIMIT_POST_PHOTO_WRITE = { max: 10, windowSec: 60 };

/**
 * Sessions, groups and routines.
 *
 * These three routers predate the caching and rate-limiting work above and are
 * being brought up to it. Separate constants again, for the reason every block
 * above gives: they describe different surfaces, and retuning a profile grid
 * should not silently retune a study timer.
 */

/**
 * A single study session. SHORT, and the shortest single-entity TTL in this
 * file, because it is the only cached payload here that a user watches change
 * WHILE they look at it: interruptions accumulate against a running session, so
 * a timer screen polling GET /api/sessions/:id is the exact surface where a
 * two-minute backstop would be felt. Every write bumps the counter, so this is
 * only the ceiling on an outage.
 */
export const CACHE_TTL_SESSION_SEC = 30;

// The caller's own session history. A profile-ish tab, matching every other
// per-user list in this file at 60s.
export const CACHE_TTL_SESSION_LIST_SEC = 60;

// A single group. Matches CACHE_TTL_POST_SEC: a group's name, description and
// privacy flag are about as static as a profile row.
export const CACHE_TTL_GROUP_SEC = 120;

// One group's member list. Shorter than the group itself because it is the
// surface a user checks straight after someone joins, and the underlying query
// is one indexed lookup with a small join.
export const CACHE_TTL_GROUP_MEMBERS_SEC = 60;

// A single routine, todo items included. Matches the single post and the single
// group: the caller who reads it is the same person whose writes bump its
// counter, so staleness is self-inflicted and corrected on the very next read.
export const CACHE_TTL_ROUTINE_SEC = 120;

// The caller's own routines. Same 60s as every other per-user list here.
export const CACHE_TTL_ROUTINE_LIST_SEC = 60;

/**
 * Sessions, groups and routines reuse RATE_LIMIT_READ, RATE_LIMIT_WRITE and
 * RATE_LIMIT_BULK as they stand, and add one tier of their own for the join
 * route below. rateLimit()'s `name` gives each of the three routers its own
 * Redis keyspace, so these budgets are independent of each other and of the
 * comment, like, post and user routers despite sharing the numbers.
 *
 * Two placements are worth stating, both on RATE_LIMIT_BULK rather than
 * RATE_LIMIT_WRITE, and neither for row count:
 *
 *   DELETE /api/groups/:id     - cascades every membership in the group, so one
 *                                call can remove dozens of rows belonging to
 *                                people other than the caller.
 *   DELETE /api/routines/:id   - cascades every todo item, and SetNulls the
 *                                sourceRoutineId of every clone anyone has ever
 *                                taken of it. The blast radius reaches other
 *                                users' rows, which is the property this tier
 *                                exists for.
 *
 * DELETE /api/sessions/:id deliberately stays on RATE_LIMIT_WRITE: it cascades
 * only its own interruptions and detaches the caller's own posts.
 */

/**
 * Joining a group - POST /api/groups/:id/join.
 *
 * The ONLY tier in this file defined against a guessing attack rather than a
 * cost. Every other route here refuses work that is expensive; this one refuses
 * ATTEMPTS, because the request body carries a secret that can be guessed:
 * joinGroup compares the supplied joinCode against the stored one and answers
 * 403 on a miss, which is a free oracle to anyone willing to keep asking.
 *
 * The generated code is six characters of base36, so ~2.2e9 possibilities.
 * RATE_LIMIT_WRITE at 20/min would exhaust a code space that size in roughly
 * 200 years, which is already fine - but updateGroupSchema lets an owner rotate
 * to a code as short as four characters (~1.7e6), and 20/min walks THAT in
 * about two months. 10/min doubles it, and more to the point makes the attempt
 * visible: nobody joins ten groups a minute, so hitting this tier is a signal
 * rather than a normal state.
 *
 * Keyed on the caller's user id like every other tier, which bounds one account
 * rather than one attacker - a determined one registers more accounts. That is
 * the known limit of a per-user limiter, and the reason a real fix is a
 * per-GROUP failure counter, not a bigger number here.
 */
export const RATE_LIMIT_GROUP_JOIN = { max: 10, windowSec: 60 };

/**
 * Goals, streaks, subscriptions and notifications.
 *
 * Separate constants again, for the reason every block above gives: they
 * describe different surfaces, and retuning a study timer should not silently
 * retune a notification badge.
 *
 * ⚠ TWO OF THE TTLs BELOW BOUND SOMETHING NO VERSION COUNTER CAN. Everywhere
 * else in this file a TTL is pure reclamation, because every input to the
 * cached payload is covered by a counter that some service bumps. The streak
 * and goal-progress payloads are the exception: both depend on WHAT DAY IT IS,
 * and no write happens at midnight to bump anything. A streak cached at 23:59
 * is wrong at 00:01 and nothing knows it. Their TTLs are therefore the real
 * staleness ceiling and must stay short - see the note on each.
 */

// The caller's goals. The longest TTL of the four: a goal is a setting someone
// changes rarely, and every write that can change it bumps its counter.
export const CACHE_TTL_GOAL_LIST_SEC = 120;

/**
 * Goal progress. Short, and for TWO reasons where most entries here have one.
 *
 * It is a live surface - a progress bar a user watches after finishing a
 * session - and it is one of the two payloads above whose period boundary no
 * counter tracks. 30s bounds both.
 */
export const CACHE_TTL_GOAL_PROGRESS_SEC = 30;

/**
 * A streak, shared by GET /me and GET /user/:userId.
 *
 * The other day-dependent payload. Its effective count is computed on read from
 * today's date (see toEffectiveStreak), so a cached copy that outlives midnight
 * reports yesterday's answer. A minute is a tolerable window for a number that
 * only changes once a day, and short enough that the wrong answer is never on
 * screen for long.
 */
export const CACHE_TTL_STREAK_SEC = 60;

/**
 * A subscription. Matches the single post and the single user profile at 120s -
 * the most static row a user has, and one only they can read.
 *
 * Note this payload has the same day-dependence problem in principle, since
 * isPremium is computed against renewsAt on read. It is not the same in
 * practice: a renewal date is 30 days out rather than hours, so being two
 * minutes late to notice an expiry is immaterial where being two minutes late
 * to a streak is not.
 */
export const CACHE_TTL_SUBSCRIPTION_SEC = 120;

/**
 * The unread notification badge. The shortest TTL in this file alongside the
 * like summary, and for the same reason: a badge that still shows 3 after you
 * have read everything is the most visible staleness this feature can produce,
 * and the query behind it is a single indexed count.
 *
 * The paginated LIST is deliberately uncached - see listMyNotifications.
 */
export const CACHE_TTL_NOTIFICATION_COUNT_SEC = 15;

/**
 * Goals and streaks reuse RATE_LIMIT_READ and RATE_LIMIT_WRITE as they stand.
 * The streak router has no write tier at all, because it has no write routes.
 *
 * DELETE /api/goals/:period stays on RATE_LIMIT_WRITE rather than
 * RATE_LIMIT_BULK, unlike most deletes in this file: it removes exactly one row
 * belonging to the caller, cascades nothing, and reaches nobody else's data -
 * which is the property the bulk tier exists to bound.
 *
 * DELETE /api/notifications - clearing the whole list - IS on RATE_LIMIT_BULK,
 * and there by row count as well as by irreversibility.
 */

/**
 * Marking notifications read.
 *
 * Reuses the LIKE write tier's number rather than RATE_LIMIT_WRITE, and for the
 * reason that tier was created: 20/min is tuned for a human typing a comment,
 * and marking notifications read is a tap. A user working down a backlog after
 * a week away legitimately fires a burst, and 20/min would throttle exactly
 * that ordinary use. Still an order of magnitude below a script.
 *
 * A separate constant despite the identical number, per the rule this file
 * states throughout - the surfaces differ and must be free to diverge.
 */
export const RATE_LIMIT_NOTIFICATION_WRITE = { max: 60, windowSec: 60 };

/**
 * Subscribing and cancelling.
 *
 * THE TIGHTEST TIER IN THIS FILE, and the only one bounding an operation
 * because of what it MEANS rather than what it costs. Subscribing is a
 * once-a-month decision; nobody subscribes and cancels five times an hour, so
 * traffic at this ceiling is a bug or an attack rather than a busy user.
 *
 * It matters more than the numbers suggest while subscribe() is a stub that
 * grants premium to anyone who asks - see the header of
 * subscription.service.js. When a real provider is wired in, each call becomes
 * a request to that provider's API, and a loop here would become a bill.
 */
export const RATE_LIMIT_SUBSCRIPTION_WRITE = { max: 5, windowSec: 3600 };
