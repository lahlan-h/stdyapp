# @stdyapp/convex-stub

**Temporary. This package is scheduled for deletion.**

It exists so the mobile app had a working backend before the real one was
ready. It is not the product's backend and nothing new should be built on it.

The real backend is `apps/api` (Express) over `@stdyapp/core` (Prisma /
Postgres), which now covers everything modelled here and considerably more —
posts, likes, comments, follows, blocks, bookmarks, reports, goals, streaks,
subscriptions and notifications.

## Why it is a separate package

It used to live *inside* `packages/core`, replacing the Prisma layer outright on
the `home-interface` branch. That made `@stdyapp/core` mean two mutually
exclusive things depending on which branch you had checked out, and the two
could never be installed together. Moving it here lets both exist while the
mobile app is migrated, and lets this one be deleted in a single commit
afterwards.

## How to remove it

Mobile reaches Convex only through `apps/mobile/src/data/`. Reimplement those
hooks against the REST API, then delete this directory and its entry in the root
`package.json` workspaces. No mobile component imports this package directly —
that is the point of the seam, and it should stay that way.

`main` points at `index.ts` rather than compiled JavaScript because Metro is the
only thing that resolves this package. Do not import it from Node — `apps/api`
must never depend on it.

## The deployment link

`convex dev` records which Convex deployment this checkout talks to in
`.env.local` **in this directory**. That file is gitignored, so it does not
travel with a clone or follow the code when it moves.

It caused a real outage once: when this package was split out of
`packages/core`, the code moved and `.env.local` stayed behind, so `convex dev`
no longer found the deployment and the mobile feed silently rendered nothing.
If you see that symptom, check this file exists here before anything else.

A fresh clone gets one by running `convex:dev` below and selecting the existing
project rather than creating a new one.

## Running it

Not started by `npm run dev` — it would block on an interactive prompt for
anyone who has not configured a deployment, which is most of the team. Start it
explicitly when working on mobile:

```bash
npm run convex:dev -w @stdyapp/convex-stub
```

Then put the URL it prints into `EXPO_PUBLIC_CONVEX_URL` in the root `.env`.
