import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { automationApi } from "@/api/automation";
import { agentLabelsApi } from "@/modules/agent-labels/api";
import { isExecutionPending } from "@/modules/automation/executionUtils";
import type {
  AppApprovalScopeType,
  AutomationExecutionSourceType,
  AutomationExecutionStatus,
  AutomationScopeTarget,
  AutomationTaskActionType,
  AutomationForceSyncRequest,
  AutomationScriptAudit,
  AutomationTaskAudit,
  CreateAutomationScriptRequest,
  CreateAutomationTaskRequest,
  UpdateAutomationScriptRequest,
  UpdateAutomationTaskRequest,
} from "@/api";

const KEYS = {
  scripts: {
    all: ["automationScripts"] as const,
    list: (params: {
      clientId?: string;
      activeOnly?: boolean;
      cursor?: string;
      limit?: number;
    }) => [...KEYS.scripts.all, "list", params] as const,
    detail: (id: string) => [...KEYS.scripts.all, "detail", id] as const,
    audit: (id: string, limit: number) =>
      [...KEYS.scripts.all, "audit", id, limit] as const,
  },
  tasks: {
    all: ["automationTasks"] as const,
    list: (params: {
      search?: string;
      clientId?: string;
      siteId?: string;
      agentId?: string;
      scopeType?: AppApprovalScopeType;
      scopeTypes?: Array<AppApprovalScopeType | string>;
      actionTypes?: Array<AutomationTaskActionType | string>;
      labels?: string[];
      scopeId?: string;
      activeOnly?: boolean;
      deletedOnly?: boolean;
      includeDeleted?: boolean;
      cursor?: string;
      limit?: number;
    }) => [...KEYS.tasks.all, "list", params] as const,
    detail: (id: string) => [...KEYS.tasks.all, "detail", id] as const,
    audit: (id: string, limit: number) =>
      [...KEYS.tasks.all, "audit", id, limit] as const,
  },
  executions: {
    all: ["automationExecutions"] as const,
    byAgent: (agentId: string, filters: AutomationExecutionFilters) =>
      [...KEYS.executions.all, agentId, filters] as const,
  },
  agentPolicies: {
    all: ["agentAutomationPolicies"] as const,
    byAgent: (agentId: string) =>
      [...KEYS.agentPolicies.all, agentId] as const,
  },
};

export function useAutomationScripts(params: {
  clientId?: string;
  activeOnly?: boolean;
  cursor?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: KEYS.scripts.list(params),
    queryFn: () => automationApi.listScripts(params),
    placeholderData: (prev) => prev,
  });
}

export function useAutomationScript(id: string) {
  return useQuery({
    queryKey: KEYS.scripts.detail(id),
    queryFn: () => automationApi.getScript(id),
    enabled: !!id,
  });
}

export function useAutomationScriptAudit(
  id: string,
  limit = 50,
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.scripts.audit(id, limit),
    queryFn: async (): Promise<AutomationScriptAudit[]> => {
      const raw = await automationApi.getScriptAudit(id, limit);
      if (Array.isArray(raw)) return raw as AutomationScriptAudit[];
      const obj = raw as unknown as { items?: AutomationScriptAudit[] };
      return Array.isArray(obj?.items) ? obj.items : [];
    },
    enabled: !!id && enabled,
  });
}

export function useCreateAutomationScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      correlationId,
    }: {
      data: CreateAutomationScriptRequest;
      correlationId?: string;
    }) => automationApi.createScript(data, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.scripts.all }),
  });
}

export function useUpdateAutomationScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      correlationId,
    }: {
      id: string;
      data: UpdateAutomationScriptRequest;
      correlationId?: string;
    }) => automationApi.updateScript(id, data, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.scripts.all }),
  });
}

export function useDeleteAutomationScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      correlationId,
    }: {
      id: string;
      reason?: string;
      correlationId?: string;
    }) => automationApi.deleteScript(id, reason, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.scripts.all }),
  });
}

export function useConsumeAutomationScript() {
  return useMutation({
    mutationFn: (id: string) => automationApi.consumeScript(id),
  });
}

export function useAutomationTasks(params: {
  search?: string;
  clientId?: string;
  siteId?: string;
  agentId?: string;
  scopeType?: AppApprovalScopeType;
  scopeTypes?: Array<AppApprovalScopeType | string>;
  actionTypes?: Array<AutomationTaskActionType | string>;
  labels?: string[];
  scopeId?: string;
  activeOnly?: boolean;
  deletedOnly?: boolean;
  includeDeleted?: boolean;
  cursor?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: KEYS.tasks.list(params),
    queryFn: () => automationApi.listTasks(params),
    placeholderData: (prev) => prev,
  });
}

export function useAutomationTask(id: string) {
  return useQuery({
    queryKey: KEYS.tasks.detail(id),
    queryFn: () => automationApi.getTask(id),
    enabled: !!id,
  });
}

export function useAutomationTaskAudit(id: string, limit = 50, enabled = true) {
  return useQuery({
    queryKey: KEYS.tasks.audit(id, limit),
    queryFn: async (): Promise<AutomationTaskAudit[]> => {
      const raw = await automationApi.getTaskAudit(id, limit);
      if (Array.isArray(raw)) return raw as AutomationTaskAudit[];
      const obj = raw as unknown as { items?: AutomationTaskAudit[] };
      return Array.isArray(obj?.items) ? obj.items : [];
    },
    enabled: !!id && enabled,
  });
}

export function useCreateAutomationTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      data,
      correlationId,
    }: {
      data: CreateAutomationTaskRequest;
      correlationId?: string;
    }) => automationApi.createTask(data, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.tasks.all }),
  });
}

export function useUpdateAutomationTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
      correlationId,
    }: {
      id: string;
      data: UpdateAutomationTaskRequest;
      correlationId?: string;
    }) => automationApi.updateTask(id, data, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.tasks.all }),
  });
}

export function useDeleteAutomationTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      correlationId,
    }: {
      id: string;
      reason?: string;
      correlationId?: string;
    }) => automationApi.deleteTask(id, reason, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.tasks.all }),
  });
}

export function useRestoreAutomationTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      correlationId,
    }: {
      id: string;
      reason?: string;
      correlationId?: string;
    }) => automationApi.restoreTask(id, reason, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.tasks.all }),
  });
}

export interface AutomationExecutionFilters {
  limit?: number;
  status?: AutomationExecutionStatus | string | number;
  sourceType?: AutomationExecutionSourceType | string | number;
  taskId?: string;
  scriptId?: string;
  correlationId?: string;
}

export function useAutomationExecutions(
  agentId: string,
  filters: AutomationExecutionFilters = {},
  enabled = true,
) {
  const { limit = 50, status, sourceType, taskId, scriptId, correlationId } = filters;

  return useQuery({
    queryKey: KEYS.executions.byAgent(agentId, {
      limit,
      status,
      sourceType,
      taskId,
      scriptId,
      correlationId,
    }),
    queryFn: () =>
      automationApi.getExecutions(agentId, {
        limit,
        status,
        sourceType,
        taskId,
        scriptId,
        correlationId,
      }),
    enabled: !!agentId && enabled,
    placeholderData: (prev) => prev,
    // A API devolve o status como string ("Dispatched"/"Acknowledged"); a versão
    // anterior comparava com 0/1 e o polling nunca ligava.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.length) return false;
      return data.some((item) => isExecutionPending(item.status)) ? 3000 : false;
    },
  });
}

export function useRunAutomationTaskNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      taskId,
      correlationId,
    }: {
      agentId: string;
      taskId: string;
      correlationId?: string;
    }) => automationApi.runTaskNow(agentId, taskId, correlationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.executions.all });
    },
  });
}

export function useRunAutomationScriptNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      scriptId,
      correlationId,
    }: {
      agentId: string;
      scriptId: string;
      correlationId?: string;
    }) => automationApi.runScriptNow(agentId, scriptId, correlationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.executions.all });
    },
  });
}

export function useForceAutomationSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      request,
      correlationId,
    }: {
      agentId: string;
      request: AutomationForceSyncRequest;
      correlationId?: string;
    }) => automationApi.forceSync(agentId, request, correlationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.executions.all });
      // O force-sync também pode mudar as políticas aplicáveis: mantém a aba
      // "Políticas" coerente para quem já a abriu.
      qc.invalidateQueries({ queryKey: KEYS.agentPolicies.all });
    },
  });
}

/**
 * Cancela uma execução pendente (comando terminal → sai da reentrega).
 */
export function useCancelAutomationExecution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      executionId,
      correlationId,
    }: {
      agentId: string;
      executionId: string;
      correlationId?: string;
    }) => automationApi.cancelExecution(agentId, executionId, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.executions.all }),
  });
}

/**
 * Operações em massa por cliente/site. Um comando (e um report) por agente
 * online do escopo; o resultado traz quantos ficaram de fora e por quê.
 */
export function useRunAutomationTaskForScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      taskId,
      correlationId,
    }: {
      scope: AutomationScopeTarget;
      taskId: string;
      correlationId?: string;
    }) => automationApi.runTaskForScope(scope, taskId, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.executions.all }),
  });
}

export function useRunAutomationScriptForScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      scriptId,
      correlationId,
    }: {
      scope: AutomationScopeTarget;
      scriptId: string;
      correlationId?: string;
    }) => automationApi.runScriptForScope(scope, scriptId, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.executions.all }),
  });
}

export function useForceAutomationSyncForScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      scope,
      request,
      correlationId,
    }: {
      scope: AutomationScopeTarget;
      request: AutomationForceSyncRequest;
      correlationId?: string;
    }) => automationApi.forceSyncForScope(scope, request, correlationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.executions.all }),
  });
}

/**
 * Políticas de automação APLICÁVEIS ao agent (o que ele recebe no policy-sync).
 * Leitura sob demanda — a aba "Políticas" do detalhe do agente é a única
 * consumidora, então nada é buscado enquanto ela não está ativa.
 */
export function useAgentAutomationPolicies(agentId: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.agentPolicies.byAgent(agentId),
    queryFn: () => automationApi.getAgentPolicies(agentId),
    enabled: !!agentId && enabled,
    staleTime: 30_000,
  });
}

export function useAutomationKnownTags() {
  return useQuery({
    queryKey: ["agentLabelRules", "knownTags"],
    queryFn: async () => {
      const rules = await agentLabelsApi.getRules(true);
      const tags = new Set<string>();
      for (const rule of rules) {
        const normalized = rule.label.trim();
        if (normalized) tags.add(normalized);
      }
      return Array.from(tags).sort((a, b) => a.localeCompare(b, "pt-BR"));
    },
    staleTime: 60_000,
  });
}
