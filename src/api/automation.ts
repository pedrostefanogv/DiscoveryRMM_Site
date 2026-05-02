import { api } from "./client";
import type {
  AppApprovalScopeType,
  AutomationTaskActionType,
  AutomationExecutionReport,
  AutomationForceSyncRequest,
  AutomationRunNowScriptResponse,
  AutomationRunNowTaskResponse,
  AutomationScriptAudit,
  AutomationScriptConsume,
  AutomationScriptDetail,
  AutomationScriptPage,
  AutomationTaskAudit,
  AutomationTaskDetail,
  AutomationTaskPage,
  CreateAutomationScriptRequest,
  CreateAutomationTaskRequest,
  TaskPreviewAgentsResponse,
  UpdateAutomationScriptRequest,
  UpdateAutomationTaskRequest,
} from "./types";

const SCRIPTS_BASE = "/api/v1/automation/scripts";
const TASKS_BASE = "/api/v1/automation/tasks";
const AGENTS_BASE = "/api/v1/agents";

function correlationInit(correlationId?: string): RequestInit | undefined {
  if (!correlationId) return undefined;
  return {
    headers: {
      "X-Correlation-Id": correlationId,
    },
  };
}

export interface ListAutomationScriptsParams {
  clientId?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListAutomationTasksParams {
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
  limit?: number;
  offset?: number;
}

export const automationApi = {
  listScripts: (params: ListAutomationScriptsParams = {}) =>
    api.get<AutomationScriptPage>(
      SCRIPTS_BASE,
      params as Record<string, unknown>,
    ),

  getScript: (id: string) =>
    api.get<AutomationScriptDetail>(`${SCRIPTS_BASE}/${id}`),

  createScript: (data: CreateAutomationScriptRequest, correlationId?: string) =>
    api.post<AutomationScriptDetail>(
      SCRIPTS_BASE,
      data,
      correlationInit(correlationId),
    ),

  updateScript: (
    id: string,
    data: UpdateAutomationScriptRequest,
    correlationId?: string,
  ) =>
    api.put<AutomationScriptDetail>(
      `${SCRIPTS_BASE}/${id}`,
      data,
      correlationInit(correlationId),
    ),

  deleteScript: (id: string, reason?: string, correlationId?: string) => {
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return api.del<void>(
      `${SCRIPTS_BASE}/${id}${query}`,
      correlationInit(correlationId),
    );
  },

  consumeScript: (id: string) =>
    api.get<AutomationScriptConsume>(`${SCRIPTS_BASE}/${id}/consume`),

  getScriptAudit: (id: string, limit = 50) =>
    api.get<AutomationScriptAudit[]>(`${SCRIPTS_BASE}/${id}/audit`, { limit }),

  listTasks: (params: ListAutomationTasksParams = {}) =>
    api.get<AutomationTaskPage>(TASKS_BASE, params as Record<string, unknown>),

  getTask: (id: string) => api.get<AutomationTaskDetail>(`${TASKS_BASE}/${id}`),

  createTask: (data: CreateAutomationTaskRequest, correlationId?: string) =>
    api.post<AutomationTaskDetail>(
      TASKS_BASE,
      data,
      correlationInit(correlationId),
    ),

  updateTask: (
    id: string,
    data: UpdateAutomationTaskRequest,
    correlationId?: string,
  ) =>
    api.put<AutomationTaskDetail>(
      `${TASKS_BASE}/${id}`,
      data,
      correlationInit(correlationId),
    ),

  deleteTask: (id: string, reason?: string, correlationId?: string) => {
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return api.del<void>(
      `${TASKS_BASE}/${id}${query}`,
      correlationInit(correlationId),
    );
  },

  restoreTask: (id: string, reason?: string, correlationId?: string) => {
    const query = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return api.post<AutomationTaskDetail>(
      `${TASKS_BASE}/${id}/restore${query}`,
      undefined,
      correlationInit(correlationId),
    );
  },

  getTaskAudit: (id: string, limit = 50) =>
    api.get<AutomationTaskAudit[]>(`${TASKS_BASE}/${id}/audit`, { limit }),

  getTaskPreviewAgents: (id: string, limit = 50, offset = 0) =>
    api.get<TaskPreviewAgentsResponse>(`${TASKS_BASE}/${id}/preview-agents`, {
      limit,
      offset,
    }),

  runTaskNow: (agentId: string, taskId: string, correlationId?: string) =>
    api.post<AutomationRunNowTaskResponse>(
      `${AGENTS_BASE}/${agentId}/automation/tasks/${taskId}/run-now`,
      undefined,
      correlationInit(correlationId),
    ),

  runScriptNow: (agentId: string, scriptId: string, correlationId?: string) =>
    api.post<AutomationRunNowScriptResponse>(
      `${AGENTS_BASE}/${agentId}/automation/scripts/${scriptId}/run-now`,
      undefined,
      correlationInit(correlationId),
    ),

  forceSync: (
    agentId: string,
    request: AutomationForceSyncRequest,
    correlationId?: string,
  ) =>
    api.post<void>(
      `${AGENTS_BASE}/${agentId}/automation/force-sync`,
      request,
      correlationInit(correlationId),
    ),

  getExecutions: (agentId: string, limit = 50) =>
    api.get<AutomationExecutionReport[]>(
      `${AGENTS_BASE}/${agentId}/automation/executions`,
      { limit },
    ),
};
