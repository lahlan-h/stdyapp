/*
  Indexes sessions by (userId, endedAt).

  For the "Personal best" badge on posts, which compares a session with the
  same user's sessions that ended before it - and the first index on
  sessions.userId at all, so every per-user session list benefits too.
*/
CREATE INDEX "sessions_userId_endedAt_idx" ON "sessions"("userId", "endedAt");
