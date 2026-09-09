// apps/mobile/metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

// The monorepo shares ONE .env at the repo root - the same file
// apps/api/src/config/env.js and packages/core/prisma.config.js read. This used
// to load from packages/core's directory instead, which stopped being where the
// env lives once the API standardised on the root file.
require("@expo/env").load(repoRoot, { force: true });

const config = getDefaultConfig(__dirname);

// Workspace packages live outside this directory, so Metro has to be told to
// watch them and where to find hoisted dependencies.
config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(repoRoot, "node_modules"),
];

// Path aliases (@theme, @components, @data) come from tsconfig.json, which
// expo/metro-config reads by default.

module.exports = config;
