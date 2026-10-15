import { api, type UploadProgress } from "./client";
import {
  AppCommandKind,
  AppDetectionMode,
  AppInstallationType,
} from "./types";
import type {
  AppApprovalScopeType,
  AppApprovalAuditChangeType,
  AppStoreCatalogPage,
  AppStoreCatalogPackage,
  AppApprovalRule,
  AppApprovalRulesResponse,
  CreateAppApprovalRuleRequest,
  AppEffectivePage,
  AppApprovalAuditPage,
  AppDiffEntry,
  AppDiffPage,
  SyncChocolateyCatalogResponse,
  CustomPackageAsset,
  UpsertCustomPackageRequest,
} from "./types";

const BASE = "/api/v1/app-store";

type RawCatalogPackage = Partial<AppStoreCatalogPackage> & {
  id?: string;
  packageIdentifier?: string;
  installCommand?: string;
};

type RawCatalogPage = Partial<Omit<AppStoreCatalogPage, "items">> & {
  items?: RawCatalogPackage[];
  returnedItems?: number;
};

type RawApprovalRule = Partial<AppApprovalRule> & {
  id?: string;
  ruleId?: string;
};

type RawApprovalRulesResponse = Omit<AppApprovalRulesResponse, "items"> & {
  items?: RawApprovalRule[];
};

function normalizeInstallationType(
  value: unknown,
  fallback?: AppInstallationType,
): AppInstallationType {
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
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "winget") return AppInstallationType.Winget;
    if (normalized === "chocolatey" || normalized === "choco") {
      return AppInstallationType.Chocolatey;
    }
    if (normalized === "custom") return AppInstallationType.Custom;
    if (normalized.includes("winget")) return AppInstallationType.Winget;
    if (normalized.includes("choco")) return AppInstallationType.Chocolatey;
  }
  return fallback ?? AppInstallationType.Winget;
}

/** Coage um valor cru (número ou string numérica) num enum numérico conhecido. */
function normalizeNumericEnum<T extends number>(
  value: unknown,
  values: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric) && values.includes(numeric as T)) {
    return numeric as T;
  }
  return fallback;
}

const APP_COMMAND_KIND_VALUES = [
  AppCommandKind.Command,
  AppCommandKind.CmdScript,
  AppCommandKind.PowerShellScript,
] as const;

const APP_DETECTION_MODE_VALUES = [
  AppDetectionMode.None,
  AppDetectionMode.InventoryLink,
  AppDetectionMode.Command,
] as const;

/** String opcional do JSON: `undefined`/vazio viram `null` (nunca `undefined`). */
function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().length > 0 ? value.trim() : null;
}

function normalizeCatalogPackage(
  item: RawCatalogPackage,
  fallbackInstallationType?: AppInstallationType,
): AppStoreCatalogPackage {
  const packageId = item.packageId ?? item.id ?? item.packageIdentifier ?? "";

  const installationType = normalizeInstallationType(
    item.installationType ?? item.installCommand,
    fallbackInstallationType,
  );

  const homepage = item.homepage ?? null;
  const iconFromApi = item.icon ?? null;
  const fallbackIcon =
    installationType === AppInstallationType.Chocolatey &&
    !iconFromApi &&
    homepage
      ? `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(homepage)}`
      : null;

  return {
    packageId,
    name: item.name ?? null,
    publisher: item.publisher ?? null,
    description: item.description ?? null,
    version: item.version ?? null,
    architecture: item.architecture ?? null,
    installationType,
    installCommand: item.installCommand ?? null,
    uninstallCommand: item.uninstallCommand ?? null,
    extractZip: Boolean(item.extractZip),
    fileName: item.fileName ?? null,
    fileSizeBytes: item.fileSizeBytes ?? null,
    fileContentType: item.fileContentType ?? null,
    fileChecksum: item.fileChecksum ?? null,
    hasFile: Boolean(item.hasFile),
    lastUpdated: item.lastUpdated ?? null,
    installerUrlsByArch: item.installerUrlsByArch ?? {},
    icon: iconFromApi ?? fallbackIcon,
    homepage,
    license: item.license ?? null,
    category: item.category ?? null,
    tags: item.tags ?? null,
    // Tipo de comando e detecção/inventário dos pacotes custom. Registros
    // antigos (sem os campos) caem em Command/None, como no servidor.
    installCommandKind: normalizeNumericEnum(
      item.installCommandKind,
      APP_COMMAND_KIND_VALUES,
      AppCommandKind.Command,
    ),
    uninstallCommandKind: normalizeNumericEnum(
      item.uninstallCommandKind,
      APP_COMMAND_KIND_VALUES,
      AppCommandKind.Command,
    ),
    detectionMode: normalizeNumericEnum(
      item.detectionMode,
      APP_DETECTION_MODE_VALUES,
      AppDetectionMode.None,
    ),
    inventorySoftwareId: normalizeOptionalText(item.inventorySoftwareId),
    detectionName: normalizeOptionalText(item.detectionName),
    detectionPublisher: normalizeOptionalText(item.detectionPublisher),
    detectionMinVersion: normalizeOptionalText(item.detectionMinVersion),
    detectionCommand: normalizeOptionalText(item.detectionCommand),
  };
}

function normalizeCatalogPage(
  page: RawCatalogPage,
  fallbackInstallationType?: AppInstallationType,
): AppStoreCatalogPage {
  const returnedItems = page.returnedItems ?? page.items?.length ?? 0;

  return {
    count: page.count ?? returnedItems,
    generatedAt: page.generatedAt ?? null,
    totalPackagesInSource: page.totalPackagesInSource,
    returnedItems,
    cursor: page.cursor ?? null,
    nextCursor: page.nextCursor ?? null,
    limit: page.limit,
    hasMore: Boolean(page.hasMore) || Boolean(page.nextCursor),
    search: page.search ?? null,
    architecture: page.architecture ?? null,
    items: (page.items ?? []).map((item) =>
      normalizeCatalogPackage(item, fallbackInstallationType),
    ),
  };
}

function normalizeApprovalRule(item: RawApprovalRule): AppApprovalRule {
  const ruleId = item.ruleId ?? item.id ?? "";
  return {
    ruleId,
    id: ruleId,
    scopeType: item.scopeType ?? 0,
    scopeId: item.scopeId ?? null,
    installationType: normalizeInstallationType(item.installationType),
    packageId: item.packageId ?? "",
    packageName: item.packageName ?? null,
    action: item.action ?? 0,
    autoUpdateEnabled: item.autoUpdateEnabled ?? null,
    reason: item.reason ?? null,
    createdAt: item.createdAt ?? "",
    updatedAt: item.updatedAt ?? "",
  };
}

function normalizeApprovalsResponse(
  response: RawApprovalRulesResponse,
  fallbackInstallationType?: AppInstallationType,
): AppApprovalRulesResponse {
  return {
    scopeType: response.scopeType,
    scopeId: response.scopeId ?? null,
    installationType:
      response.installationType !== undefined
        ? normalizeInstallationType(response.installationType)
        : normalizeInstallationType(fallbackInstallationType),
    count: response.count ?? response.items?.length ?? 0,
    items: (response.items ?? []).map(normalizeApprovalRule),
  };
}

function normalizeSyncResponse(
  raw: Partial<SyncChocolateyCatalogResponse> & Record<string, unknown>,
): SyncChocolateyCatalogResponse {
  const pick = <T>(camel: string, pascal: string): T | undefined => {
    const value = raw[camel] ?? raw[pascal];
    return value === undefined ? undefined : (value as T);
  };
  const installationType = normalizeInstallationType(
    pick<unknown>("installationType", "InstallationType"),
  );
  return {
    installationType,
    success: Boolean(pick<boolean>("success", "Success") ?? true),
    packagesUpserted: pick<number>("packagesUpserted", "PackagesUpserted") ?? 0,
    pagesProcessed: pick<number>("pagesProcessed", "PagesProcessed"),
    syncedAt: pick<string>("syncedAt", "SyncedAt") ?? null,
    sourceGeneratedAt:
      pick<string>("sourceGeneratedAt", "SourceGeneratedAt") ?? null,
    duration: pick<string>("duration", "Duration") ?? null,
    error: pick<string>("error", "Error") ?? null,
  };
}

export interface AppStoreSyncStatus {
  running: boolean;
  lastResult: SyncChocolateyCatalogResponse | null;
}

function normalizeSyncStatus(
  raw: Partial<AppStoreSyncStatus> & Record<string, unknown>,
): AppStoreSyncStatus {
  const running = raw.running ?? raw.Running ?? false;
  const lastRaw = raw.lastResult ?? raw.LastResult;
  return {
    running: Boolean(running),
    lastResult: lastRaw
      ? normalizeSyncResponse(lastRaw as Record<string, unknown>)
      : null,
  };
}

export interface CatalogParams {
  installationType?: AppInstallationType;
  search?: string;
  architecture?: string;
  limit?: number;
  cursor?: string;
}

export interface ApprovalsParams {
  scopeType: AppApprovalScopeType;
  scopeId?: string | null;
  installationType?: AppInstallationType;
}

export interface AuditParams {
  installationType?: AppInstallationType;
  packageId?: string;
  scopeType?: AppApprovalScopeType;
  scopeId?: string;
  changedBy?: string;
  changedFrom?: string;
  changedTo?: string;
  changeType?: AppApprovalAuditChangeType;
  limit?: number;
  cursor?: string;
}

export interface EffectiveParams {
  scopeType: AppApprovalScopeType;
  scopeId?: string | null;
  installationType?: AppInstallationType;
  search?: string;
  limit?: number;
  cursor?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// Upload multipart DIRETO no object storage (RustFS/S3)
// ═══════════════════════════════════════════════════════════════════════
//
// Instaladores grandes não podem subir num corpo único pela API: o Cloudflare
// recusa o corpo no edge (413). O fluxo correto é multipart DIRETO no storage —
// a API cria o multipart e só pré-assina cada bloco de 50 MiB; o navegador faz
// PUT na URL assinada. Como as partes ficam no storage até o complete, o envio
// é RETOMÁVEL: guardamos o uploadId + ETags em localStorage por impressão do
// arquivo (nome+tamanho+data), então um novo envio do mesmo arquivo continua
// exatamente de onde parou (inclusive depois de fechar/reabrir a página).

const ASSET_PART_SIZE = 50 * 1024 * 1024;
const MULTIPART_STATE_PREFIX = "discovery:asset-multipart:";
const PART_MAX_ATTEMPTS = 4;

interface MultipartPart {
  partNumber: number;
  etag: string;
  sizeBytes: number;
}

interface MultipartUploadState {
  uploadId: string;
  objectKey: string;
  partSizeBytes: number;
  totalParts: number;
  fingerprint: string;
  parts: MultipartPart[];
}

interface MultipartStatusResponse {
  uploadId: string;
  objectKey: string;
  partSizeBytes: number;
  totalParts: number;
  receivedBytes: number;
  receivedParts: MultipartPart[];
  pendingParts: number[];
}

interface MultipartSessionResponse {
  uploadId: string;
  objectKey: string;
  partSizeBytes: number;
  totalParts: number;
}

function multipartFingerprint(file: File, kind: string): string {
  return `${kind}:${file.name}:${file.size}:${file.lastModified}`;
}

function readMultipartState(key: string): MultipartUploadState | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MultipartUploadState;
    return parsed?.uploadId ? parsed : null;
  } catch {
    return null;
  }
}

function writeMultipartState(key: string, state: MultipartUploadState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Modo privado / quota cheia: o envio continua, só perde a retomada.
  }
}

function clearMultipartState(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignorado
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Envia um bloco direto ao storage, renovando a URL assinada se ela expirar. */
async function uploadPartWithRetry(
  partNumber: number,
  url: string,
  blob: Blob,
  refreshUrl: (partNumber: number) => Promise<string>,
  onProgress?: (loaded: number, total: number) => void,
): Promise<MultipartPart> {
  let lastError: unknown = null;
  let currentUrl = url;

  for (let attempt = 1; attempt <= PART_MAX_ATTEMPTS; attempt++) {
    try {
      const { etag } = await api.putPresignedPart(currentUrl, blob, {
        timeoutMs: 0,
        onProgress: onProgress
          ? (progress) => onProgress(progress.loaded, progress.total)
          : undefined,
      });

      if (!etag) {
        throw new Error("O storage não devolveu o ETag do bloco.");
      }

      return { partNumber, etag, sizeBytes: blob.size };
    } catch (error) {
      lastError = error;
      if (attempt === PART_MAX_ATTEMPTS) break;

      // 403/expiração: a URL assinada venceu (upload longo) — pede outra.
      currentUrl = await refreshUrl(partNumber).catch(() => currentUrl);
      await delay(500 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Falha ao enviar o bloco ao storage.");
}

/**
 * Upload multipart direto no storage com retomada. Devolve o asset publicado
 * (mesmo formato do upload único) já finalizado pelo storage.
 */
async function uploadCustomAssetDirect(
  file: File,
  kind: "installer" | "icon",
  onProgress?: (progress: UploadProgress) => void,
): Promise<CustomPackageAsset> {
  const fingerprint = multipartFingerprint(file, kind);
  const stateKey = MULTIPART_STATE_PREFIX + fingerprint;

  let state = readMultipartState(stateKey);

  // 1) Tenta RETOMAR: o storage é a fonte de verdade das partes recebidas.
  if (state) {
    const status = await api
      .get<MultipartStatusResponse>(`${BASE}/custom/assets/multipart/${state.uploadId}`)
      .catch(() => null);

    if (status) {
      state = {
        ...state,
        objectKey: status.objectKey,
        partSizeBytes: status.partSizeBytes,
        totalParts: status.totalParts,
        parts: status.receivedParts ?? [],
      };
    } else {
      clearMultipartState(stateKey);
      state = null;
    }
  }

  // 2) Abre um novo multipart no storage.
  if (!state) {
    const session = await api.post<MultipartSessionResponse>(`${BASE}/custom/assets/multipart`, {
      kind,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });

    state = {
      uploadId: session.uploadId,
      objectKey: session.objectKey,
      partSizeBytes: session.partSizeBytes || ASSET_PART_SIZE,
      totalParts: session.totalParts || Math.max(1, Math.ceil(file.size / ASSET_PART_SIZE)),
      fingerprint,
      parts: [],
    };
    writeMultipartState(stateKey, state);
  }

  const partSize = state.partSizeBytes > 0 ? state.partSizeBytes : ASSET_PART_SIZE;
  const totalParts = state.totalParts > 0 ? state.totalParts : Math.max(1, Math.ceil(file.size / partSize));
  const completed = new Set(state.parts.map((part) => part.partNumber));
  let uploadedBytes = state.parts.reduce((sum, part) => sum + (part.sizeBytes ?? 0), 0);

  const report = (inFlight = 0) => {
    if (!onProgress) return;
    const sent = Math.min(file.size, uploadedBytes + inFlight);
    onProgress({
      loaded: sent,
      total: file.size,
      percent: file.size > 0 ? Math.min(100, Math.round((sent / file.size) * 100)) : 0,
    });
  };

  report();

  const pending = Array.from({ length: totalParts }, (_, index) => index + 1).filter(
    (partNumber) => !completed.has(partNumber),
  );

  // 3) Envia bloco a bloco direto na URL pré-assinada do storage.
  if (pending.length > 0) {
    const batch = await api.post<{ parts: { partNumber: number; url: string }[] }>(
      `${BASE}/custom/assets/multipart/${state.uploadId}/parts`,
      { partNumbers: pending },
    );

    const urls = new Map(batch.parts.map((part) => [part.partNumber, part.url]));

    const refreshUrl = async (partNumber: number): Promise<string> => {
      const refreshed = await api.post<{ parts: { partNumber: number; url: string }[] }>(
        `${BASE}/custom/assets/multipart/${state!.uploadId}/parts`,
        { partNumbers: [partNumber] },
      );
      const url = refreshed.parts.find((part) => part.partNumber === partNumber)?.url;
      if (!url) throw new Error(`Não foi possível renovar a URL do bloco ${partNumber}.`);
      return url;
    };

    for (const partNumber of pending) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);

      let url = urls.get(partNumber);
      if (!url) {
        url = await refreshUrl(partNumber);
      }

      const uploaded = await uploadPartWithRetry(
        partNumber,
        url,
        blob,
        refreshUrl,
        (loaded) => report(loaded),
      );

      state.parts.push(uploaded);
      state.parts.sort((a, b) => a.partNumber - b.partNumber);
      uploadedBytes += uploaded.sizeBytes;
      // Gravado a CADA bloco: se a página cair, o próximo envio retoma daqui.
      writeMultipartState(stateKey, state);
      report();
    }
  }

  // 4) Finaliza no storage (a API só envia os ETags e publica o asset).
  // Sem timeout no cliente: a API ainda calcula o SHA-256 do arquivo montado
  // (passada de leitura no loopback) e um instalador de vários GiB demora.
  // A API é idempotente, então uma resposta perdida pode ser reconferida.
  let asset: CustomPackageAsset;
  try {
    asset = await api.post<CustomPackageAsset>(
      `${BASE}/custom/assets/multipart/${state.uploadId}/complete`,
      { parts: state.parts },
      { timeoutMs: 0 },
    );
  } catch (error) {
    await delay(2000);
    asset = await api.post<CustomPackageAsset>(
      `${BASE}/custom/assets/multipart/${state.uploadId}/complete`,
      { parts: state.parts },
      { timeoutMs: 0 },
    );
  }

  clearMultipartState(stateKey);
  return asset;
}

export const appStoreApi = {
  syncCatalog: async (installationType: AppInstallationType) => {
    // Dispara o job em background (202). O resultado é obtido via polling
    // de getSyncStatus feito pelo componente (useSyncCatalog + CatalogTab).
    await api.post<unknown>(
      `${BASE}/sync?installationType=${installationType}`,
    );
    return {
      installationType,
      success: true,
      packagesUpserted: 0,
      syncedAt: new Date().toISOString(),
    } satisfies SyncChocolateyCatalogResponse;
  },

  getSyncStatus: async (installationType: AppInstallationType) => {
    const response = await api.get<
      Partial<AppStoreSyncStatus> & Record<string, unknown>
    >(`${BASE}/sync/status`, { installationType });
    return normalizeSyncStatus(response ?? {});
  },

  getCatalog: async (params: CatalogParams = {}) => {
    const queryParams: Record<string, unknown> = { ...params };

    const response = await api.get<RawCatalogPage>(
      `${BASE}/catalog`,
      queryParams,
    );
    return normalizeCatalogPage(response, params.installationType);
  },

  getPackage: async (
    packageId: string,
    installationType?: AppInstallationType,
  ) => {
    const queryParams: Record<string, unknown> =
      installationType !== undefined ? { installationType } : {};

    const response = await api.get<RawCatalogPackage>(
      `${BASE}/catalog/${encodeURIComponent(packageId)}`,
      queryParams,
    );
    return normalizeCatalogPackage(response, installationType);
  },

  getApprovals: async (params: ApprovalsParams) => {
    const response = await api.get<RawApprovalRulesResponse>(
      `${BASE}/approvals`,
      params as unknown as Record<string, unknown>,
    );
    return normalizeApprovalsResponse(response, params.installationType);
  },

  createApproval: (data: CreateAppApprovalRuleRequest) =>
    api.post<AppApprovalRule>(`${BASE}/approvals`, data),

  deleteApproval: (ruleId: string, reason?: string) => {
    const q = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return api.del<void>(`${BASE}/approvals/${ruleId}${q}`);
  },

  getAudit: (params: AuditParams = {}) =>
    api.get<AppApprovalAuditPage>(
      `${BASE}/approvals/audit`,
      params as unknown as Record<string, unknown>,
    ),

  getEffective: (params: EffectiveParams) =>
    api.get<AppEffectivePage>(
      `${BASE}/effective`,
      params as unknown as Record<string, unknown>,
    ),

  getDiff: (
    packageId: string,
    params: Pick<EffectiveParams, "scopeType" | "scopeId" | "installationType">,
  ) =>
    api.get<AppDiffEntry>(
      `${BASE}/diff/${encodeURIComponent(packageId)}`,
      params as unknown as Record<string, unknown>,
    ),

  getDiffEffective: (params: EffectiveParams) =>
    api.get<AppDiffPage>(
      `${BASE}/diff/effective`,
      params as unknown as Record<string, unknown>,
    ),

  // ── Pacotes custom (cadastro manual) ──────────────────────────────

  /**
   * Envia instalador (kind=installer) ou ícone/capa (kind=icon) para o object
   * storage.
   *
   * Até 50 MiB: uma requisição multipart para a API. Acima disso: MULTIPART
   * DIRETO no storage (RustFS/S3) em blocos de 50 MiB — o arquivo não passa pela
   * API (o Cloudflare recusa corpo único de vários GiB com 413) e o envio é
   * retomável (partes ficam no storage entre tentativas).
   */
  uploadCustomAsset: async (
    file: File,
    kind: "installer" | "icon" = "installer",
    onProgress?: (progress: UploadProgress) => void,
  ) => {
    const PART_SIZE = ASSET_PART_SIZE;

    // Arquivos pequenos: caminho direto (1 requisição multipart).
    if (file.size <= PART_SIZE) {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<CustomPackageAsset>(
        `${BASE}/custom/assets?kind=${kind}`,
        formData,
        { timeoutMs: 0, onProgress },
      );
    }

    // Arquivos grandes: multipart DIRETO no storage, com retomada.
    return uploadCustomAssetDirect(file, kind, onProgress);
  },

  /** Cria ou atualiza um pacote custom. */
  upsertCustomPackage: (data: UpsertCustomPackageRequest) =>
    api.post<AppStoreCatalogPackage>(`${BASE}/custom`, data),

  /** Remove um pacote custom. */
  deleteCustomPackage: (packageId: string) =>
    api.del<void>(`${BASE}/custom/${encodeURIComponent(packageId)}`),

  /**
   * Apaga APENAS o instalador publicado do pacote custom (metadados continuam).
   * O objeto é removido do object storage no servidor.
   */
  deleteCustomPackageFile: (packageId: string) =>
    api.del<void>(`${BASE}/custom/${encodeURIComponent(packageId)}/file`),
};
