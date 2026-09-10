import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the single repo-root .env as an import side effect.
 *
 * This module exists because ES modules evaluate their whole import graph
 * before the importing module's body runs. Calling dotenv.config() in the body
 * of index.js therefore happened AFTER every route, controller and
 * @stdyapp/core module had already been evaluated, so anything reading
 * process.env at import time saw undefined.
 *
 * Importing this file FIRST in index.js guarantees process.env is populated
 * before anything else, because static imports are evaluated in source order.
 *
 * Paths are relative to THIS file (apps/api/src/config/) - moving it breaks them.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

// The whole monorepo shares one .env at the repo root; the Prisma CLI reads
// that same file through packages/core/prisma.config.js.
dotenv.config({
  path: path.resolve(here, "../../../../.env"),
});
