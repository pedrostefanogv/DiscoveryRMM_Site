import { existsSync, readFileSync } from "node:fs";

const requiredOutputs = [
  "dist/index.html",
  "dist/manifest.webmanifest",
  "dist/sw.js",
];

const missing = requiredOutputs.filter((file) => !existsSync(file));

if (missing.length > 0) {
  console.error("[verify-build] Missing expected build artifacts:");
  for (const file of missing) {
    console.error(" - " + file);
  }
  process.exit(1);
}

// Icones referenciados pelo manifest e pelo Service Worker precisam existir em
// dist/. Sem eles a notificacao do navegador aparece SEM ICONE e o PWA nao
// instala corretamente — foi o caso quando o manifest apontava para
// pwa-192x192.png/pwa-512x512.png, que nunca existiram no repositorio.
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
const manifestIcons = (Array.isArray(manifest.icons) ? manifest.icons : [])
  .map((icon) => String(icon && icon.src ? icon.src : "").replace(/^\//, ""))
  .filter((src) => src.length > 0);

if (manifestIcons.length === 0) {
  console.error("[verify-build] manifest.webmanifest nao declara icones.");
  process.exit(1);
}

const swSource = readFileSync("dist/sw.js", "utf8");
const swIconPattern = /["'\x60](\/[A-Za-z0-9._-]+\.(?:png|svg|ico|webp|jpg))["'\x60]/g;
const swIcons = Array.from(new Set(Array.from(swSource.matchAll(swIconPattern), (match) => match[1])));

const referencedIcons = Array.from(new Set(manifestIcons.map((src) => "/" + src).concat(swIcons)));
const missingIcons = referencedIcons.filter((src) => !existsSync("dist" + src));

if (missingIcons.length > 0) {
  console.error("[verify-build] Icones referenciados mas ausentes em dist/:");
  for (const icon of missingIcons) {
    console.error(" - " + icon);
  }
  console.error("  (a notificacao do navegador apareceria sem icone)");
  process.exit(1);
}

console.log("[verify-build] Build artifacts verified (" + referencedIcons.length + " icone(s) conferido(s)).");
