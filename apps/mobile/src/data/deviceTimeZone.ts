/**
 * The device's IANA zone, so "Tuesday" and "9am" on the screen mean the
 * user's Tuesday and 9am rather than the server's UTC ones - and so a
 * leaderboard's week starts at the user's Monday midnight.
 *
 * Read on every request rather than once at import: a phone that lands in
 * another timezone mid-session should get that zone's days on the next load.
 * UTC is the fallback for an engine without Intl zone data, and it is also
 * the API's own default, so the answer is still consistent - just in UTC days.
 */
export const deviceTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
