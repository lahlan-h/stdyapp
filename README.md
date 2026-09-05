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
