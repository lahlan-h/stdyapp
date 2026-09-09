<h1 align="center">stdyapp</h1>

<p align="center">Set goals, find friends, see results.</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="license"/>
  <img src="https://img.shields.io/badge/status-in%20development-yellow" alt="status"/>
</p>

<div align="center">
  <img src="packages/shared/assets/stdy.png" alt="stdyapp"/>
</div>

## About

**stdy** is a study-session tracker and feed built by students at the University
of Technology Sydney. Our aim is to make studying engaging by logging, posting,
and tracking your study sessions.

## Repository layout

An npm-workspaces monorepo, orchestrated by [Turborepo](https://turborepo.dev).

| Workspace | What it is |
| --- | --- |
| `apps/api` | Express REST API. Controllers → services → repositories, with Redis caching, RabbitMQ and R2 uploads. |
| `apps/mobile` | The Expo / React Native app. |
| `apps/web` | Web client. Not started yet. |
| `packages/core` | Prisma schema and client, plus the shared Redis, RabbitMQ, R2 and logging clients. |
| `packages/shared` | Framework-agnostic helpers used by more than one app. |
| `packages/ui` | Shared UI components. Not started yet. |
| `packages/convex-stub` | **Temporary.** The Convex backend mobile used before the API was ready. [Scheduled for deletion.](packages/convex-stub/README.md) |

## Getting started

### Prerequisites

- **Node.js 20+** and npm 10+
- **Docker** — for Redis, RabbitMQ and the migration shadow database
- A **Supabase** (or any Postgres) database

### Setup

```bash
git clone https://github.com/lahlan-h/stdyapp.git
cd stdyapp
npm install
```

Copy the environment template and fill it in. There is **one** `.env` at the
repo root, shared by every workspace:

```bash
cp .env.example .env
```

Every variable is documented in [.env.example](.env.example). At minimum you
need `DATABASE_URL`, `DIRECT_URL` and a `JWT_SECRET` of at least 32 characters
(`openssl rand -base64 32`) — the API refuses to boot without a valid one.

Start the backing services and apply the database schema:

```bash
docker compose up -d
npm run db:generate
npm run db:migrate
```

### Running

```bash
npm run dev                        # everything, via turbo
npm run dev -w @stdyapp/api        # just the API      → http://localhost:4000
npm run dev -w @stdyapp/mobile     # just the Expo app
```

Check the API is healthy — it reports every dependency, and returns 503 if any
of them is unreachable:

```bash
curl localhost:4000/api/health
```

### Testing

```bash
npm test -w @stdyapp/shared
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for naming conventions, branch and commit
rules, and the review process.

## License

[Apache 2.0](LICENSE).
