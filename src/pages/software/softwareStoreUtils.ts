import { formatBytes as formatBytesCanonical, formatDateTime as formatDateTimeCanonical } from '@/utils/format';

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

/** Rota base da Loja de Softwares. */
export const STORE_PATH = "/software/store";

/**
 * Query param que preserva a aba (tipo de catálogo) na URL da loja. Sem ele o
 * `CatalogTab` remontava com o padrão Winget ao voltar do editor de pacote
 * custom — o operador salvava um custom e caía na listagem do Winget.
 */
export const STORE_TYPE_QUERY_PARAM = "tipo";

/** Slug estável do tipo de instalação usado na URL da loja. */
export function installationTypeSlug(type: AppInstallationType): string {
  switch (type) {
    case AppInstallationType.Chocolatey:
      return "chocolatey";
    case AppInstallationType.Custom:
      return "custom";
    default:
      return "winget";
  }
}

/** Rota da loja já abrindo no tipo informado (ex.: custom ao voltar do editor). */
export function buildStorePath(
  type: AppInstallationType = AppInstallationType.Winget,
): string {
  // O padrão (Winget) fica implícito: `/software/store` limpo, sem `?tipo=winget`.
  if (type === AppInstallationType.Winget) return STORE_PATH;
  return `${STORE_PATH}?${STORE_TYPE_QUERY_PARAM}=${installationTypeSlug(type)}`;
}

/**
 * Lê o tipo da URL da loja. Valor ausente ou desconhecido cai no padrão
 * Winget, o mesmo comportamento anterior ao uso do query param.
 */
export function installationTypeFromStoreSearch(
  search: string | URLSearchParams,
): AppInstallationType {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  return normalizeInstallationType(params.get(STORE_TYPE_QUERY_PARAM));
}

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

export function actionBadge(action: AppApprovalActionType | null) {
  if (action === AppApprovalActionType.Allow) return "Permitido";
  if (action === AppApprovalActionType.Deny) return "Negado";
  return "\u2014";
}

export function scopeLabel(s: AppApprovalScopeType) {
  return ["Global", "Cliente", "Site", "Agente"][s] ?? String(s);
}

export function formatDate(d: string | null) {
  return formatDateTimeCanonical(d);
}

/** Tamanho em bytes no formato curto (ex.: "12,3 MB"). Vazio quando inválido. */
export function formatBytes(value?: number | null): string {
  return formatBytesCanonical(value, "");
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
