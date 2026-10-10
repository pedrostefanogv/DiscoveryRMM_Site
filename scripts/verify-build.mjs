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

// O vite-plugin-pwa monta o Service Worker com
// `rollupOptions.output.inlineDynamicImports: true` — opcao ainda aceita, mas
// DEPRECIADA pelo rolldown/Vite 8, que avisa no build:
//   "inlineDynamicImports option is deprecated, please use codeSplitting: false"
// O aviso e inofensivo enquanto a inlining valer, mas o motivo dela nao e
// cosmetico: um Service Worker PRECISA ser um unico arquivo autocontido. Se um
// dia o bundler parar de inlinar, o sw.js passaria a referenciar um chunk
// externo e install/offline/Web Push quebrariam de forma silenciosa (o
// navegador so registra o erro no console do cliente). Este check transforma o
// aviso em invariante verificada.
const swDynamicImports = swSource.match(/\bimport\s*\(/g) ?? [];
const swStaticImports = swSource.match(/(?:^|[;{}\n])\s*import\s*[{*"']/g) ?? [];

if (swDynamicImports.length > 0 || swStaticImports.length > 0) {
  console.error("[verify-build] dist/sw.js nao esta autocontido:");
  console.error(
    " - imports dinamicos: " +
      swDynamicImports.length +
      ", imports estaticos: " +
      swStaticImports.length,
  );
  console.error("  (Service Worker precisa ser um unico arquivo — ver inlineDynamicImports/codeSplitting)");
  process.exit(1);
}

console.log(
  "[verify-build] Build artifacts verified (" +
    referencedIcons.length +
    " icone(s) conferido(s), SW autocontido).",
);
