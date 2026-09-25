const { getDefaultConfig } = require("expo/metro-config");

// Default Expo config. Shared rules with the desktop app live in src/shared
// (kept in sync by scripts/sync-shared.js) and resolve via the @shared/*
// path in tsconfig.json.
module.exports = getDefaultConfig(__dirname);
