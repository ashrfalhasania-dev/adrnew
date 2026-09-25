/**
 * Copies the desktop app's shared rules (../app/shared: permissions,
 * statuses, payments) into src/shared, so phone and desktop always apply
 * the exact same rules. Cloud builds (EAS) upload only this folder, so the
 * copy is committed here; this script refreshes it whenever ../app exists.
 * Run automatically before every build (BUILD_APK.bat) and on npm install.
 */
const fs = require("fs");
const path = require("path");

const from = path.resolve(__dirname, "../../app/shared");
const to = path.resolve(__dirname, "../src/shared");

if (!fs.existsSync(from)) {
  console.log("[sync-shared] ../app/shared not found -- keeping the committed copy.");
  process.exit(0);
}
fs.mkdirSync(to, { recursive: true });
let n = 0;
for (const file of fs.readdirSync(from)) {
  if (!file.endsWith(".ts")) continue;
  const src = fs.readFileSync(path.join(from, file), "utf8");
  const banner = "// AUTO-COPIED from app/shared/" + file + " by scripts/sync-shared.js -- edit the original, not this copy.\n";
  fs.writeFileSync(path.join(to, file), banner + src);
  n++;
}
console.log(`[sync-shared] copied ${n} file(s) from app/shared.`);
