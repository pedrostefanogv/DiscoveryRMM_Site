import { api } from "./client";
import { AppInstallationType } from "./types";
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
} from "./types";

const BASE = "/api/app-store";

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
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "winget") return AppInstallationType.Winget;
    if (normalized === "chocolatey" || normalized === "choco") {
      return AppInstallationType.Chocolatey;
    }
    if (normalized.includes("winget")) return AppInstallationType.Winget;
    if (normalized.includes("choco")) return AppInstallationType.Chocolatey;
  }
  return fallback ?? AppInstallationType.Winget;
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
    lastUpdated: item.lastUpdated ?? null,
    installerUrlsByArch: item.installerUrlsByArch ?? {},
    icon: iconFromApi ?? fallbackIcon,
    homepage,
    license: item.license ?? null,
    category: item.category ?? null,
    tags: item.tags ?? null,
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
    hasMore: Boolean(page.hasMore),
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

function installationTypeQueryValue(
  installationType?: AppInstallationType,
): "Winget" | "Chocolatey" | undefined {
  if (installationType === undefined) return undefined;
  return installationType === AppInstallationType.Chocolatey
    ? "Chocolatey"
    : "Winget";
}

export const appStoreApi = {
  syncWingetCatalog: () =>
    api.post<SyncChocolateyCatalogResponse>(`${BASE}/winget/sync`),

  syncChocolateyCatalog: () =>
    api.post<SyncChocolateyCatalogResponse>(`${BASE}/chocolatey/sync`),

  getCatalog: async (params: CatalogParams = {}) => {
    const queryParams: Record<string, unknown> = {
      ...params,
      installationType: installationTypeQueryValue(params.installationType),
    };

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
    const queryParams: Record<string, unknown> = {
      installationType: installationTypeQueryValue(installationType),
    };

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
};
