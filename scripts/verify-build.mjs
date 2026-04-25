import { existsSync } from "node:fs";

const requiredOutputs = [
  "dist/index.html",
  "dist/manifest.webmanifest",
  "dist/sw.js",
];

const missing = requiredOutputs.filter((file) => !existsSync(file));

if (missing.length > 0) {
  console.error("[verify-build] Missing expected build artifacts:");
  for (const file of missing) {
    console.error(` - ${file}`);
  }
  process.exit(1);
}

console.log("[verify-build] Build artifacts verified.");
