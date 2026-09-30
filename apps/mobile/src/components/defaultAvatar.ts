/**
 * The avatar to draw when a user has none of their own.
 *
 * Shared rather than defined at each call site, which is the point: the seed
 * and the style together decide which image a person gets, so two copies that
 * drift by one query parameter would give the SAME user a different face on the
 * feed than on their profile. avatarUrl is nullable in the schema and no signup
 * path sets it, so this is the common case rather than the fallback.
 */
export const defaultAvatar = (seed: string): string =>
  `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(seed)}`;
