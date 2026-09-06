<h1 font color=lightblue align="center"><font color=lightblue>stdyapp</font></h1>
<p align="center">Set goals, find friends, see results.</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="license"/>
  <img src="https://img.shields.io/badge/status-in%20development-yellow" alt="status"/>
</p>

<div align="center">
  <img src="packages/shared/assets/stdy.png"></img>
</div>

## About

<font color=lightblue>**stdy**</font> is a study-session tracker and feed built by students at the University of Technology Sydney. Our aim is to make studying engaging by logging, posting, and tracking your study sessions.

## Features

- Populate once features are completed

## Screenshots

- Include screenshots once completed

## Installation

```bash
git clone https://github.com/yourteam/stdyapp.git
cd stdyapp
npm install
npm run dev --workspace @stdy/gui

# OR run the built docker image!

# blah blah blah steps steps steps

```

## Environment

One `.env` at the repo root serves the whole monorepo (the API reads it via
`apps/api/src/config/env.js`, the Prisma CLI via `packages/core/prisma.config.js`).
It is gitignored — ask a teammate for the real values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase pooled connection, for normal queries |
| `DIRECT_URL` | Supabase direct connection, for migrations |
| `SHADOW_DATABASE_URL` | local `postgres-shadow` container, for `migrate dev` |
| `REDIS_URL` | defaults to `redis://localhost:6379` |
| `RABBITMQ_URL` | defaults to the local container |
| `JWT_SECRET` | **required** — signs access tokens, min 32 chars |
| `R2_ENDPOINT` | **required** — Cloudflare R2 S3 API endpoint |
| `R2_BUCKET_NAME` | **required** — `stdyapp` in prod, `stdyapp-dev` locally |
| `R2_ACCESS_KEY_ID` | **required** — R2 API token |
| `R2_SECRET_ACCESS_KEY` | **required** — R2 API token |
| `R2_PUBLIC_URL` | public base URL for uploaded objects |

The four R2 variables marked required are the set `missingConfig()` in
`packages/core/src/storage.js` checks; without them the server still boots but
logs `[r2] not configured` and every upload fails. `R2_PUBLIC_URL` only warns at
boot, but an avatar upload refuses with a 502 rather than storing a URL no client
could load. Watch for `[r2] connected to bucket "stdyapp"` at startup, and check
`GET /api/health` if it does not appear — it names which variable is wrong.

The API refuses to boot without a valid `JWT_SECRET`. Generate one with:

```bash
openssl rand -base64 48
```

## Photo uploads

Photos are sent as **raw bytes**, not `multipart/form-data` and not base64. Set an
image `Content-Type` and put the file in the body:

```bash
# Avatar - one step, replaces whatever was there
curl -X PUT localhost:4000/api/users/$ID/photo \
  -H "Authorization: Bearer $TOK" -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg

# Post - two steps, because a post carries a caption as well as a file
KEY=$(curl -s -X POST localhost:4000/api/posts/photo \
  -H "Authorization: Bearer $TOK" -H "Content-Type: image/jpeg" \
  --data-binary @photo.jpg | jq -r .photoKey)

curl -X POST localhost:4000/api/posts \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d "{\"caption\":\"3h of discrete maths\",\"photoKey\":\"$KEY\"}"
```

JPEG, PNG or WebP, 5 MB max. The declared `Content-Type` only gets the request
accepted - the stored format is re-derived from the file's magic bytes, so lying
about it is harmless and sending a non-image is a 415.

Things worth knowing:

- **`avatarUrl` and `photoUrl` are not client input any more.** Sending either to
  `PATCH /api/users/:id` or `PATCH /api/posts/:id` is a 400. The server builds them.
- **A post's photo is fixed at creation.** `PATCH` edits the caption and the
  session/routine links only; to change the picture, delete the post and repost.
- **`photoKey` is single-use.** It names a staged object under `tmp/`, which is
  removed once the post row exists. Reusing a key is a 400.
- **The `photoUrl` returned by `POST /api/posts/photo` is a preview.** It stops
  resolving once the post is created; the post carries the durable URL.
- Deleting a post (or `DELETE /api/posts/user/me`) deletes its object from R2.
  Posts seeded with third-party URLs are left alone.

### Bucket prerequisite

Staged uploads land under `tmp/`. A post that is never created leaves its object
there, so the bucket needs **one lifecycle rule: expire objects under `tmp/` after
24 hours** (Cloudflare dashboard - R2 > the bucket > Settings > Object lifecycle
rules). Without it those objects accumulate; they are harmless and nothing
references them, but nothing reclaims them either.

## Devs!

Hey Devs! Some ground rules here:

- **(1)** Clanker code is obviously allowed but you MUST understand how it actually works and please document it!

- **(2)** Follow the naming conventions!
  - **(2.1)** Branches: kebab-case
  - **(2.2)** Variables: camelCase
  - **(2.3)** Functions: camelCase
  - **(2.4)** Constants: SCREAMING_SNAKE_CASE
  - **(2.5)** Classes: PascalCase

- **(3)** File naming convections!
  - **(2.1)**
  - **(2.2)**
  - **(2.3)**

- **(4)** Commit messages: lower case please e.g. added user auth

Along with all that ensure your code is well **commented**. In order to merge into **main** will require another dev to review and approve.

Finally, the 'works on my machine bro' ends here. Be responsible for managing packages and versions (suggest you use a tool called **mise**). And if you want to share something with the team please <font color="lightblue">dockerize!!</font>.
