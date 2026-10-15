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
   * Arquivos grandes vão em BLOCOS de 50 MiB (padronizado): um corpo único de
   * vários GiB é recusado pelo Cloudflare no edge com 413, então a API abre uma
   * sessão, recebe os blocos e remonta o arquivo no servidor.
   */
  uploadCustomAsset: async (
    file: File,
    kind: "installer" | "icon" = "installer",
    onProgress?: (progress: UploadProgress) => void,
  ) => {
    const PART_SIZE = 50 * 1024 * 1024;

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

    const session = await api.post<{ uploadId: string; partSizeBytes: number; totalParts: number }>(
      `${BASE}/custom/assets/session`,
      {
        kind,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      },
    );

    const partSize = session.partSizeBytes > 0 ? session.partSizeBytes : PART_SIZE;
    const totalParts = Math.max(1, Math.ceil(file.size / partSize));

    try {
      for (let index = 0; index < totalParts; index++) {
        const start = index * partSize;
        const end = Math.min(start + partSize, file.size);
        const blob = file.slice(start, end);
        await api.putBinary(
          `${BASE}/custom/assets/session/${session.uploadId}/part/${index}`,
          blob,
          {
            timeoutMs: 0,
            onProgress: onProgress
              ? (p) => {
                  const inPart = p.total > 0 ? Math.min(p.loaded, end - start) : 0;
                  const sent = start + inPart;
                  onProgress({
                    loaded: sent,
                    total: file.size,
                    percent: Math.round((sent / file.size) * 100),
                  });
                }
              : undefined,
          },
        );
      }

      return await api.post<CustomPackageAsset>(
        `${BASE}/custom/assets/session/${session.uploadId}/complete`,
        {},
      );
    } catch (error) {
      // best-effort: libera a sessão/arquivo temporário no servidor.
      void api.del(`${BASE}/custom/assets/session/${session.uploadId}`).catch(() => undefined);
      throw error;
    }
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
