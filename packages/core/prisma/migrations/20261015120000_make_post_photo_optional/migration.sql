/*
  Makes posts.photoUrl optional, for text-only posts.

  A post now needs a title plus a photo OR a caption. That "one of the two" is
  enforced in post.service.js rather than here: a CHECK constraint could say it,
  but it would only catch what the service already refuses, and a violation
  would surface as an opaque 500 instead of the service's 400.

  Every existing row has a photo, so nothing needs backfilling.
*/
ALTER TABLE "posts" ALTER COLUMN "photoUrl" DROP NOT NULL;
