import { api } from "./client";
import type {
  AppInstallationType,
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
} from "./types";

const BASE = "/api/app-store";

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
  getCatalog: (params: CatalogParams = {}) =>
    api.get<AppStoreCatalogPage>(
      `${BASE}/catalog`,
      params as Record<string, unknown>,
    ),

  getPackage: (packageId: string, installationType?: AppInstallationType) =>
    api.get<AppStoreCatalogPackage>(
      `${BASE}/catalog/${encodeURIComponent(packageId)}`,
      installationType !== undefined ? { installationType } : {},
    ),

  getApprovals: (params: ApprovalsParams) =>
    api.get<AppApprovalRulesResponse>(
      `${BASE}/approvals`,
      params as unknown as Record<string, unknown>,
    ),

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
