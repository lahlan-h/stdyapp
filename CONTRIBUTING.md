# Contributing

Hey devs! Some ground rules.

## Code

**AI-assisted code is fine — but you must understand how it actually works, and
you must document it.** If you cannot explain a line in review, it does not go in.

Comment your code. Explain *why*, not *what*: the code already says what it does.

## Naming conventions

| Thing | Convention | Example |
| --- | --- | --- |
| Branches | kebab-case, with a type prefix | `feat/user-auth` |
| Variables | camelCase | `sessionCount` |
| Functions | camelCase | `getUserById` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_PAGE_SIZE` |
| Classes | PascalCase | `HttpError` |
| React components | PascalCase, one per file | `PostCard.tsx` |
| Everything else | camelCase, with a role suffix where the layer has one | `post.service.js` |

Branch prefixes: `feat/`, `fix/`, `chore/`, `docs/`. Pick one — we have ended up
with `feat/`, `feature/` and bare names all at once, and they sort badly.

## Commits

Lower case, imperative, and say what changed:

```
add user auth
fix streak rollover at midnight
```

## Pull requests

- Merging into `main` requires **another dev's review and approval**.
- Keep branches short-lived. Long-running branches are how we ended up needing a
  dedicated integration branch to reconcile six of them at once — rebase onto
  `main` often, and merge before a branch grows past a few dozen commits.
- Rerun `npm install` if you changed any `package.json`, and commit the
  resulting `package-lock.json`.

## Database changes

Migrations live in `packages/core/prisma/migrations/`. Always give one a
descriptive name:

```bash
npm run db:migrate -- --name add_user_privacy_flags
```

**Never rename or edit a migration directory that has already been applied.** Its
name is the primary key in Prisma's `_prisma_migrations` table, so renaming it
breaks every database that has already run it — including your teammates'.

## Environment and dependencies

The "works on my machine" thing ends here. Be responsible for managing packages
and versions — [mise](https://mise.jdx.dev) is a good tool for pinning your
toolchain. Anything the team needs to run should be in `docker-compose.yml`, and
any new environment variable must be added to `.env.example` in the same PR.
