import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration for @stdyapp/core.
 *
 * The CLI only auto-loads a .env sitting next to the schema or in the cwd, and
 * this monorepo keeps a single .env at the repo root. Every db:* script runs
 * with packages/core as its cwd, so DATABASE_URL / DIRECT_URL /
 * SHADOW_DATABASE_URL were simply never set. Loading the root file here fixes
 * that for generate, migrate, deploy and studio alike.
 *
 * Note: the mere existence of this file switches Prisma's own .env auto-loading
 * off, so this is now the ONLY place the CLI gets its connection strings from.
 *
 * The path is relative to THIS file - moving it breaks the lookup.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

try {
  // Same precedence rule as dotenv: a variable already present in the real
  // environment (CI, Docker, `DATABASE_URL=... npm run db:deploy`) wins over
  // the file, so this never clobbers a deliberate override.
  process.loadEnvFile(path.resolve(here, "../../.env"));
} catch {
  // No root .env - fine when the environment already carries the vars.
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
});
