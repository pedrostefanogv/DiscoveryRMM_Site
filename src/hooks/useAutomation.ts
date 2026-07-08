import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { automationApi } from "@/api/automation";
import { agentLabelsApi } from "@/modules/agent-labels/api";
import type {
  AppApprovalScopeType,
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
    byAgent: (agentId: string, limit: number) =>
      [...KEYS.executions.all, agentId, limit] as const,
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
      const obj = raw as unknown as {
        items?: AutomationScriptAudit[];
        data?: AutomationScriptAudit[];
      };
      return Array.isArray(obj?.items)
        ? obj.items
        : Array.isArray(obj?.data)
          ? obj.data
          : [];
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
      // API may return a paginated object { items: [...] } or a direct array
      if (Array.isArray(raw)) return raw as AutomationTaskAudit[];
      const obj = raw as unknown as {
        items?: AutomationTaskAudit[];
        data?: AutomationTaskAudit[];
      };
      return Array.isArray(obj?.items)
        ? obj.items
        : Array.isArray(obj?.data)
          ? obj.data
          : [];
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

export function useAutomationExecutions(
  agentId: string,
  limit = 50,
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.executions.byAgent(agentId, limit),
    queryFn: () => automationApi.getExecutions(agentId, limit),
    enabled: !!agentId && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.length) return false;
      const hasPending = data.some(
        (item) => item.status === 0 || item.status === 1,
      );
      return hasPending ? 3000 : false;
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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: KEYS.executions.byAgent(vars.agentId, 50),
      });
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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: KEYS.executions.byAgent(vars.agentId, 50),
      });
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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: KEYS.executions.byAgent(vars.agentId, 50),
      });
    },
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
