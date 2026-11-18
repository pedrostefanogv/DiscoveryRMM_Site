import fs from "node:fs";
import path from "node:path";

export const SITE_ROOT = path.resolve(import.meta.dirname, "../../..");

// Safe at Vite transform time: returns {} if directory/files do not exist yet.
// Os globs são relativos a ESTE arquivo (tests/e2e/helpers/): são necessários
// TRÊS níveis para chegar na raiz do site (helpers -> e2e -> tests -> raiz).
export const remoteRdpGlob = import.meta.glob("../../../src/modules/remote-rdp/**/*.{ts,tsx}");
export const remoteProxyGlob = import.meta.glob("../../../src/modules/remote-proxy/**/*.{ts,tsx}");
export const remoteFilesGlob = import.meta.glob("../../../src/modules/remote-files/**/*.{ts,tsx}");
export const remoteScreenGlob = import.meta.glob("../../../src/modules/remote-screen/**/*.{ts,tsx}");
export const remoteProcessesGlob = import.meta.glob("../../../src/modules/remote-processes/**/*.{ts,tsx}");
export const apiTypesGlob = import.meta.glob("../../../src/api/types/**/*.{ts,tsx}");

export function pathExistsInSite(relPathFromSiteRoot: string): boolean {
  return fs.existsSync(path.resolve(SITE_ROOT, relPathFromSiteRoot));
}

export function readSiteText(relPathFromSiteRoot: string): string {
  return fs.readFileSync(path.resolve(SITE_ROOT, relPathFromSiteRoot), "utf8");
}

export function listNonTestKeys(globMap: Record<string, () => Promise<unknown>>): string[] {
  return Object.keys(globMap).filter(
    (k) => !k.endsWith(".test.ts") && !k.endsWith(".test.tsx") && !k.endsWith(".spec.ts") && !k.endsWith(".spec.tsx"),
  );
}

export async function loadDiscoveredModule<T = Record<string, unknown>>(
  globMap: Record<string, () => Promise<unknown>>,
  preferredSuffixes: string[],
  fallbackToAny = false,
): Promise<{ path: string; mod: T } | null> {
  const keys = listNonTestKeys(globMap).sort();
  for (const suffix of preferredSuffixes) {
    const match = keys.find((k) => k.toLowerCase().endsWith(suffix.toLowerCase()));
    if (match) {
      return { path: match, mod: (await globMap[match]()) as T };
    }
  }
  if (fallbackToAny) {
    const sorted = [
      ...keys.filter((k) => k.endsWith(".tsx")),
      ...keys.filter((k) => !k.endsWith(".tsx")),
    ];
    for (const k of sorted) {
      const mod = (await globMap[k]()) as Record<string, unknown>;
      const hasFnExport = Object.values(mod).some((v) => typeof v === "function");
      if (hasFnExport) {
        return { path: k, mod: mod as T };
      }
    }
    if (sorted.length > 0) {
      return { path: sorted[0], mod: (await globMap[sorted[0]]()) as T };
    }
  }
  return null;
}

export function extractReactComponentExport(
  mod: Record<string, unknown>,
  preferredNames: string[] = [],
): ((props: Record<string, unknown>) => unknown) | null {
  for (const name of preferredNames) {
    const candidate = mod[name];
    if (typeof candidate === "function") {
      return candidate as (props: Record<string, unknown>) => unknown;
    }
  }
  if (typeof mod.default === "function") {
    return mod.default as (props: Record<string, unknown>) => unknown;
  }
  for (const [key, val] of Object.entries(mod)) {
    if (typeof val === "function" && /^[A-Z]/.test(key)) {
      return val as (props: Record<string, unknown>) => unknown;
    }
  }
  return null;
}

export async function loadAllDiscoveredModules(
  globMap: Record<string, () => Promise<unknown>>,
): Promise<Array<{ path: string; mod: Record<string, unknown> }>> {
  const keys = listNonTestKeys(globMap).sort();
  const out: Array<{ path: string; mod: Record<string, unknown> }> = [];
  for (const k of keys) {
    out.push({ path: k, mod: (await globMap[k]()) as Record<string, unknown> });
  }
  return out;
}
