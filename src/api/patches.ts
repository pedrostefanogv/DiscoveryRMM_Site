import { api } from "./client";
import type {
  AgentWindowsUpdatePage,
  AgentWindowsUpdateSnapshot,
  PatchApproval,
  PatchApprovalActionType,
  PatchApprovalAudit,
  PatchApprovalScopeType,
  PatchDispatchResult,
  PatchEnforcementMode,
  PatchInventoryAgentsPage,
  PatchInventoryList,
  PatchOverview,
  PatchPendingList,
  PatchPolicy,
  PatchRebootPolicy,
  PatchScope,
  PatchScopeSnapshot,
} from "./types";

const BASE = "/api/v1/patches";

export interface PatchScopeParams {
  scope?: PatchScope;
  scopeId?: string;
}

export interface PatchInventoryParams extends PatchScopeParams {
  cursor?: string;
  limit?: number;
  search?: string;
  severity?: string;
  status?: string;
  order?: "asc" | "desc";
}

export const patchesApi = {
  overview: (params?: PatchScopeParams) =>
    api.get<PatchOverview>(`${BASE}/overview`, {
      scope: params?.scope,
      scopeId: params?.scopeId,
    }),

  snapshot: (params?: PatchScopeParams) =>
    api.get<PatchScopeSnapshot>(`${BASE}/snapshot`, {
      scope: params?.scope,
      scopeId: params?.scopeId,
    }),

  inventory: (params?: PatchInventoryParams) =>
    api.get<PatchInventoryList>(`${BASE}/inventory`, {
      scope: params?.scope,
      scopeId: params?.scopeId,
      cursor: params?.cursor,
      limit: params?.limit,
      search: params?.search,
      severity: params?.severity,
      status: params?.status,
      order: params?.order,
    }),

  inventoryAgents: (
    groupKey: string,
    params?: PatchScopeParams & {
      cursor?: string;
      limit?: number;
      status?: string;
    },
  ) =>
    api.get<PatchInventoryAgentsPage>(
      `${BASE}/inventory/${encodeURIComponent(groupKey)}/agents`,
      {
        scope: params?.scope,
        scopeId: params?.scopeId,
        cursor: params?.cursor,
        limit: params?.limit,
        status: params?.status,
      },
    ),

  pending: (
    params?: PatchScopeParams & {
      cursor?: string;
      limit?: number;
      search?: string;
    },
  ) =>
    api.get<PatchPendingList>(`${BASE}/pending`, {
      scope: params?.scope,
      scopeId: params?.scopeId,
      cursor: params?.cursor,
      limit: params?.limit,
      search: params?.search,
    }),

  approvals: (params?: {
    scopeType?: PatchApprovalScopeType;
    scopeId?: string;
    search?: string;
    limit?: number;
  }) =>
    api.get<PatchApproval[]>(`${BASE}/approvals`, {
      scopeType: params?.scopeType,
      scopeId: params?.scopeId,
      search: params?.search,
      limit: params?.limit,
    }),

  approvalAudit: (params?: { limit?: number }) =>
    api.get<PatchApprovalAudit[]>(`${BASE}/approvals/audit`, {
      limit: params?.limit,
    }),

  createApproval: (body: {
    scopeType: PatchApprovalScopeType;
    scopeId?: string | null;
    updateKey: string;
    action?: PatchApprovalActionType;
    reason?: string | null;
  }) => api.post<PatchApproval>(`${BASE}/approvals`, body),

  deleteApproval: (ruleId: string) =>
    api.del<{ success?: boolean }>(`${BASE}/approvals/${ruleId}`),

  policy: (params: { scopeType: PatchApprovalScopeType; scopeId?: string }) =>
    api.get<PatchPolicy>(`${BASE}/policy`, {
      scopeType: params.scopeType,
      scopeId: params.scopeId,
    }),

  policies: () => api.get<PatchPolicy[]>(`${BASE}/policies`),
};

/**
 * O client HTTP não expõe querystring separada do path para PUT; montamos a URL
 * com os parâmetros de escopo aqui.
 */
function withScopeQuery(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export const patchPolicyApi = {
  get: (params: { scopeType: PatchApprovalScopeType; scopeId?: string }) =>
    api.get<PatchPolicy>(`${BASE}/policy`, {
      scopeType: params.scopeType,
      scopeId: params.scopeId,
    }),

  update: (
    body: {
      enforcementMode: PatchEnforcementMode;
      autoApproveClassifications: string[];
      autoApproveSeverities: string[];
      autoInstallEnabled: boolean;
      maintenanceWindowJson: string | null;
      rebootPolicy: PatchRebootPolicy;
      rebootAllowed: boolean;
      maxInstallsPerRun: number;
      hideDeniedUpdates: boolean;
      /** WU-04/D09: dias de retenção por idade de publicação (0 = sem deferral). */
      deferralDays?: number;
      /** WU-05/D03: deadline de instalação em dias (0 = sem deadline). */
      deadlineDays?: number;
      /** WU-19/WU-20/D22: origens habilitadas ("os"/"third_party"). */
      sources?: string[];
      /** Segundo consentimento para apps de terceiros. */
      allowThirdPartyApps?: boolean;
    },
    params: { scopeType: PatchApprovalScopeType; scopeId?: string },
  ) =>
    api.put<PatchPolicy>(
      withScopeQuery(`${BASE}/policy`, {
        scopeType: params.scopeType,
        scopeId: params.scopeId,
      }),
      body,
    ),
};

export const patchActionsApi = {
  scan: (body: { scope: PatchScope; scopeId?: string | null; agentIds?: string[] }) =>
    api.post<PatchDispatchResult>(`${BASE}/scan`, body),

  install: (body: {
    scope: PatchScope;
    scopeId?: string | null;
    updateKeys: string[];
    force?: boolean;
    confirm?: boolean;
    postAction?: "none" | "restart" | "shutdown";
  }) => api.post<PatchDispatchResult>(`${BASE}/install`, body),
};

// ── Escopo do agente (aba "Atualizações") ─────────────────────────────────

const agentBase = (agentId: string) =>
  `/api/v1/agents/${agentId}/windows-updates`;

export const agentPatchesApi = {
  page: (
    agentId: string,
    params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      severity?: string;
      order?: "asc" | "desc";
    },
  ) =>
    api.get<AgentWindowsUpdatePage>(`${agentBase(agentId)}/page`, {
      page: params?.page,
      pageSize: params?.pageSize,
      search: params?.search,
      status: params?.status,
      severity: params?.severity,
      order: params?.order,
    }),

  snapshot: (agentId: string) =>
    api.get<AgentWindowsUpdateSnapshot>(`${agentBase(agentId)}/snapshot`),

  /**
   * Pede uma varredura imediata ao agente. `reason` é registrado na auditoria
   * do comando (ex.: "botão da aba Atualizações", "alerta de varredura desatualizada").
   */
  scan: (agentId: string, body?: { reason?: string }) =>
    api.post<PatchDispatchResult>(`${agentBase(agentId)}/scan`, body ?? {}),

  install: (
    agentId: string,
    updateKey: string,
    body?: { force?: boolean; postAction?: "none" | "restart" | "shutdown"; reason?: string },
  ) =>
    api.post<{ success: boolean; commandId: string }>(
      `${agentBase(agentId)}/${encodeURIComponent(updateKey)}/install`,
      body ?? {},
    ),

  installApproved: (
    agentId: string,
    body?: { postAction?: "none" | "restart" | "shutdown"; confirm?: boolean },
  ) =>
    api.post<PatchDispatchResult>(`${agentBase(agentId)}/install-approved`, body ?? {}),

  approve: (
    agentId: string,
    updateKey: string,
    body?: {
      scope?: PatchApprovalScopeType;
      reason?: string;
      targetScopeId?: string | null;
    },
  ) =>
    api.post<PatchApproval>(
      `${agentBase(agentId)}/${encodeURIComponent(updateKey)}/approve`,
      body ?? {},
    ),

  deny: (
    agentId: string,
    updateKey: string,
    body?: {
      scope?: PatchApprovalScopeType;
      reason?: string;
      targetScopeId?: string | null;
    },
  ) =>
    api.post<PatchApproval>(
      `${agentBase(agentId)}/${encodeURIComponent(updateKey)}/deny`,
      body ?? {},
    ),

  bulk: (
    agentId: string,
    body: {
      action: "approve" | "deny" | "install";
      updateKeys: string[];
      scope?: PatchApprovalScopeType;
      reason?: string;
    },
  ) => api.post<PatchDispatchResult>(`${agentBase(agentId)}/bulk`, body),

  approvePending: (
    agentId: string,
    body?: {
      action?: "Approve" | "Deny";
      scope?: PatchApprovalScopeType;
      reason?: string;
    },
  ) => api.post<PatchDispatchResult>(`${agentBase(agentId)}/approve-pending`, body ?? {}),

  applyOsPolicy: (agentId: string, body?: { hideDenied?: boolean }) =>
    api.post<PatchDispatchResult>(`${agentBase(agentId)}/os-policy/apply`, body ?? {}),

  rollbackOsPolicy: (agentId: string) =>
    api.post<PatchDispatchResult>(`${agentBase(agentId)}/os-policy/rollback`, {}),
};
