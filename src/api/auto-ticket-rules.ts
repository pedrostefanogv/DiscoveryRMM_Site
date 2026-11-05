import { api } from "./client";

const BASE = "/api/v1/auto-ticket-rules";
const POLICY_BASE = "/api/v1/auto-ticket-policy";

/**
 * Campos reais do contrato do backend (AutoTicketRuleDto).
 *
 * ATENÇÃO: a página usava nomes inventados (monitoringEventCode,
 * ticketTitleTemplate...) que não existem na API — o "drift de contrato"
 * apontado no plano. Os tipos abaixo refletem o que o backend devolve.
 */
export interface AutoTicketRuleDto {
  id: string;
  name: string;
  isEnabled: boolean;
  scopeLevel: string;
  scopeId: string | null;
  alertCodeFilter: string | null;
  sourceFilter: string | null;
  targetDepartmentId: string | null;
  targetWorkflowProfileId: string | null;
  targetCategory: string | null;
  targetPriority: string;
  dedupWindowMinutes: number;
  cooldownMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAutoTicketRuleRequest {
  name: string;
  isEnabled: boolean;
  scopeLevel: string;
  scopeId?: string | null;
  alertCodeFilter?: string | null;
  targetDepartmentId?: string | null;
  targetWorkflowProfileId?: string | null;
  targetCategory?: string | null;
  targetPriority?: string | null;
  dedupWindowMinutes?: number;
  cooldownMinutes?: number;
}

/** Evento sintético para simulação (dry-run) — nada é gravado. */
export interface AutoTicketRuleDryRunRequest {
  clientId: string;
  siteId?: string | null;
  agentId: string;
  alertCode: string;
  severity?: number;
  title?: string | null;
  message?: string | null;
  metricKey?: string | null;
  metricValue?: number | null;
  payloadJson?: string | null;
  labels?: string[] | null;
  source?: number;
}

export interface AutoTicketRuleDryRunResponse {
  decision: number;
  wouldCreateTicket: boolean;
  ruleId: string | null;
  ruleName: string | null;
  reason: string;
  dedupKey: string | null;
}

export interface AutoTicketRuleStatsResponse {
  ruleId: string;
  ruleName: string;
  scopeLevel: string;
  scopeId: string | null;
  alertCodeFilter: string | null;
  periodHours: number;
  periodStartUtc: string;
  periodEndUtc: string;
  totalEvaluations: number;
  selectedExecutions: number;
  createdCount: number;
  dedupedCount: number;
  suppressedCount: number;
  matchedNoActionCount: number;
  failedCount: number;
  rateLimitedCount: number;
  matchRate: number;
  dedupRate: number;
  createRate: number;
  failureRate: number;
  firstSelectedAtUtc: string | null;
  lastSelectedAtUtc: string | null;
}

export interface SeedDefaultAutoTicketRulesResponse {
  createdCount: number;
  updatedCount: number;
  rules: {
    ruleId: string;
    name: string;
    label: string;
    status: string;
    departmentId: string | null;
    workflowProfileId: string | null;
    warning: string | null;
  }[];
}

/**
 * Política hierárquica (Server -> Client -> Site). O backend devolve a política
 * EFETIVA e a PROVENIÊNCIA de cada campo, que é o que permite responder
 * "por que este site não abre chamado?".
 */
export interface AutoTicketPolicyDto {
  level: string;
  targetId: string | null;
  own: Record<string, unknown> | null;
  effective: {
    enabled: boolean;
    mode: string;
    disabledByLevel: string | null;
    minConsecutiveFailures: number;
    minDurationSeconds: number;
    minImpactToOpen: string;
    openOnWarning: boolean;
    suppressWhenHostNotReachable: boolean;
    dedupWindowMinutes: number;
    dedupWindowMaxHours: number;
    maxCreatedTicketsPerHourPerAlertCode: number;
    incrementOccurrenceCounter: boolean;
    neverTicketSensorKeys: string[];
    allowedSensorKeys: string[];
    defaultDepartmentId: string | null;
    defaultCategory: string | null;
    aiMode: string;
    aiMinConfidence: number;
    aiSuggestibleFields: string[];
    aiAllowEquipmentContext: boolean;
    aiAnonymizeAssetNames: boolean;
  } | null;
  provenance: Record<string, string>;
}

export const autoTicketRulesApi = {
  list: (scopeLevel?: string, scopeId?: string, isEnabled?: boolean) => {
    const params = new URLSearchParams();
    if (scopeLevel) params.set("scopeLevel", scopeLevel);
    if (scopeId) params.set("scopeId", scopeId);
    if (isEnabled !== undefined) params.set("isEnabled", String(isEnabled));
    const qs = params.toString();
    return api.get<AutoTicketRuleDto[]>(qs ? `${BASE}?${qs}` : BASE);
  },

  get: (id: string) => api.get<AutoTicketRuleDto>(`${BASE}/${id}`),

  create: (data: UpsertAutoTicketRuleRequest) =>
    api.post<AutoTicketRuleDto>(BASE, data),

  update: (id: string, data: Partial<UpsertAutoTicketRuleRequest>) =>
    api.put<AutoTicketRuleDto>(`${BASE}/${id}`, { id, ...data }),

  enable: (id: string) =>
    api.patch<AutoTicketRuleDto>(`${BASE}/${id}/enable`, {}),

  disable: (id: string) =>
    api.patch<AutoTicketRuleDto>(`${BASE}/${id}/disable`, {}),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),

  /** Simulação sem gravar nada — sem id de regra. */
  simulate: (data: AutoTicketRuleDryRunRequest) =>
    api.post<AutoTicketRuleDryRunResponse>(`${BASE}/simulate`, data),

  /** Simulação sem gravar nada — restrita a uma regra. */
  dryRun: (id: string, data: AutoTicketRuleDryRunRequest) =>
    api.post<AutoTicketRuleDryRunResponse>(`${BASE}/${id}/dry-run`, data),

  getStats: (id: string, periodHours = 168) =>
    api.get<AutoTicketRuleStatsResponse>(
      `${BASE}/${id}/stats?periodHours=${periodHours}`,
    ),

  seedDefaults: (clientId: string, isEnabled = true) =>
    api.post<SeedDefaultAutoTicketRulesResponse>(`${BASE}/seed-defaults`, {
      clientId,
      isEnabled,
    }),

  /** Política efetiva + proveniência do escopo informado. */
  getPolicy: (clientId?: string, siteId?: string) => {
    const params = new URLSearchParams();
    if (clientId) params.set("clientId", clientId);
    if (siteId) params.set("siteId", siteId);
    const qs = params.toString();
    return api.get<AutoTicketPolicyDto>(qs ? `${POLICY_BASE}?${qs}` : POLICY_BASE);
  },

  saveServerPolicy: (policy: Record<string, unknown>) =>
    api.put<AutoTicketPolicyDto>(POLICY_BASE, policy),

  saveClientPolicy: (clientId: string, policy: Record<string, unknown>) =>
    api.put<AutoTicketPolicyDto>(`${POLICY_BASE}/client/${clientId}`, policy),

  saveSitePolicy: (siteId: string, policy: Record<string, unknown>) =>
    api.put<AutoTicketPolicyDto>(`${POLICY_BASE}/site/${siteId}`, policy),
};
