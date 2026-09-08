// packages/mobile/metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Resolve @stdyapp/core via its real package name through the workspace
// symlink — not a guessed relative path.
const coreDir = path.dirname(require.resolve("@stdyapp/core/package.json"));
require("@expo/env").load(coreDir, { force: true });

const config = getDefaultConfig(__dirname);

module.exports = config;
