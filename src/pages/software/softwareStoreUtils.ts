import {
  AppApprovalActionType,
  AppApprovalScopeType,
  AppInstallationType,
} from "@/api/types";

// ── helpers ───────────────────────────────────────────────────

export const installationTypeOptions = [
  { value: String(AppInstallationType.Winget), label: "Winget" },
  { value: String(AppInstallationType.Chocolatey), label: "Chocolatey" },
  { value: String(AppInstallationType.Custom), label: "Custom" },
];

export const scopeTypeOptions = [
  { value: String(AppApprovalScopeType.Global), label: "Global" },
  { value: String(AppApprovalScopeType.Client), label: "Cliente" },
  { value: String(AppApprovalScopeType.Site), label: "Site" },
  { value: String(AppApprovalScopeType.Agent), label: "Agente" },
];

export const actionOptions = [
  { value: String(AppApprovalActionType.Allow), label: "Permitir" },
  { value: String(AppApprovalActionType.Deny), label: "Negar" },
];

export const limitOptions = [
  { value: "20", label: "20 por página" },
  { value: "50", label: "50 por página" },
  { value: "100", label: "100 por página" },
];

export const APP_STORE_LAST_SYNC_STORAGE_KEY =
  "discovery.appStore.lastSyncByType.v1";

export function extractDomain(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  try {
    return new URL(value).hostname;
  } catch {
    try {
      return new URL(`https://${value}`).hostname;
    } catch {
      return null;
    }
  }
}

export function buildIconCandidates(
  url?: string | null,
  homepage?: string | null,
  downloadUrl?: string | null,
): string[] {
  const candidates: string[] = [];
  const domains = [extractDomain(downloadUrl), extractDomain(homepage)].filter(
    (v): v is string => Boolean(v),
  );
  const uniqueDomains = [...new Set(domains)];

  if (url?.trim()) {
    candidates.push(url.trim());
  }

  for (const domain of uniqueDomains) {
    candidates.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      `https://${domain}/favicon.ico`,
    );
  }

  if (homepage?.trim()) {
    const source = homepage.trim();
    candidates.push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(source)}&sz=128`,
      `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(source)}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(source)}.ico`,
    );

    try {
      const parsed = new URL(source);
      candidates.push(
        `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=128`,
        `https://icons.duckduckgo.com/ip3/${parsed.hostname}.ico`,
        `${parsed.protocol}//${parsed.hostname}/favicon.ico`,
      );
    } catch {
      // homepage pode vir em formato inesperado; ignora parse sem quebrar o render.
    }
  }

  return [...new Set(candidates)];
}

export function actionBadge(action: AppApprovalActionType) {
  return action === AppApprovalActionType.Allow ? "Permitido" : "Negado";
}

export function scopeLabel(s: AppApprovalScopeType) {
  return ["Global", "Cliente", "Site", "Agente"][s] ?? String(s);
}

export function formatDate(d: string | null) {
  if (!d) return "\u2014";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "\u2014";
  return date.toLocaleString("pt-BR");
}

/** Tamanho em bytes no formato curto (ex.: "12,3 MB"). Vazio quando inválido. */
export function formatBytes(value?: number | null): string {
  if (!value || value <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Duração curta para a estimativa de tempo restante do upload ("45 s", "12 min",
 * "1 h 5 min"). Devolve null quando não há estimativa confiável.
 */
export function formatEta(seconds?: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;

  // floor (não round) para nunca exibir "60 s"/"60 min" — arredondaria para a
  // unidade seguinte sem trocar o rótulo.
  if (seconds < 60) return `${Math.max(1, Math.floor(seconds))} s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  // Link muito lento pode estimar dias: mostra em dias para não exibir "50 h".
  if (hours >= 24) {
    const days = Math.round(hours / 24);
    return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  }

  return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Sugere um ID de pacote a partir do título (sem acentos/espaços). */
export function slugifyPackageId(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function normalizeInstallationType(value: unknown): AppInstallationType {
  if (value === AppInstallationType.Winget || value === 0 || value === "0") {
    return AppInstallationType.Winget;
  }
  if (
    value === AppInstallationType.Chocolatey ||
    value === 1 ||
    value === "1"
  ) {
    return AppInstallationType.Chocolatey;
  }
  if (value === AppInstallationType.Custom || value === 2 || value === "2") {
    return AppInstallationType.Custom;
  }
  if (typeof value === "string" && value.trim().toLowerCase() === "winget") {
    return AppInstallationType.Winget;
  }
  if (
    typeof value === "string" &&
    ["chocolatey", "choco"].includes(value.trim().toLowerCase())
  ) {
    return AppInstallationType.Chocolatey;
  }
  if (typeof value === "string" && value.trim().toLowerCase() === "custom") {
    return AppInstallationType.Custom;
  }
  return AppInstallationType.Winget;
}
