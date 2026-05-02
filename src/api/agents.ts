import { api } from "./client";
import type {
  Agent,
  AgentHardwareInfo,
  DiskInfo,
  NetworkAdapterInfo,
  MemoryModuleInfo,
  ListeningPortInfo,
  OpenSocketInfo,
  AgentSoftwareInventoryPage,
  AgentSoftwareOrder,
  AgentSoftwareInventorySnapshot,
  AgentCommand,
  AgentToken,
  ApproveZeroTouchResponse,
  CreateAgentRequest,
  UpdateAgentRequest,
  SendCommandRequest,
  CreateTokenRequest,
  HardwareReportRequest,
  StartRemoteDebugSessionRequest,
  StartRemoteDebugSessionResponse,
} from "./types";

const BASE = "/api/v1/Agents";

export interface HardwareReport {
  hardware: AgentHardwareInfo | null;
  disks: DiskInfo[];
  networkAdapters: NetworkAdapterInfo[];
  memoryModules: MemoryModuleInfo[];
  printers?: unknown[];
  inventoryRaw?: unknown;
  listeningPorts?: ListeningPortInfo[];
  openSockets?: OpenSocketInfo[];
}

export const agentsApi = {
  listBySite: (siteId: string) => api.get<Agent[]>(`${BASE}/by-site/${siteId}`),

  listByClient: (clientId: string) =>
    api.get<Agent[]>(`${BASE}/by-client/${clientId}`),

  get: (id: string) => api.get<Agent>(`${BASE}/${id}`),

  create: (data: CreateAgentRequest) => api.post<Agent>(BASE, data),

  update: (id: string, data: UpdateAgentRequest) =>
    api.put<Agent>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),

  // Hardware
  getHardware: (id: string) =>
    api.get<HardwareReport>(`${BASE}/${id}/hardware`),

  reportHardware: (id: string, data: HardwareReportRequest) =>
    api.post<void>(`${BASE}/${id}/hardware`, data),

  // Software inventory
  getSoftware: (
    id: string,
    params?: {
      cursor?: string;
      limit?: number;
      search?: string;
      order?: AgentSoftwareOrder;
    },
  ) =>
    api.get<AgentSoftwareInventoryPage>(`${BASE}/${id}/software`, {
      cursor: params?.cursor,
      limit: params?.limit,
      search: params?.search,
      order: params?.order,
    }),

  getSoftwareSnapshot: (id: string) =>
    api.get<AgentSoftwareInventorySnapshot>(`${BASE}/${id}/software/snapshot`),

  // Commands
  listCommands: (id: string, limit = 50) =>
    api.get<AgentCommand[]>(`${BASE}/${id}/commands`, { limit }),

  sendCommand: (id: string, data: SendCommandRequest) =>
    api.post<AgentCommand>(`${BASE}/${id}/commands`, data),

  // Tokens
  listTokens: (id: string) => api.get<AgentToken[]>(`${BASE}/${id}/tokens`),

  createToken: (id: string, data: CreateTokenRequest) =>
    api.post<AgentToken>(`${BASE}/${id}/tokens`, data),

  deleteAllTokens: (id: string) => api.del<void>(`${BASE}/${id}/tokens`),

  deleteToken: (id: string, tokenId: string) =>
    api.del<void>(`${BASE}/${id}/tokens/${tokenId}`),

  // Install token
  createInstallToken: (agentId: string) =>
    api.post<{ token: string }>(`/api/v1/agent-install/${agentId}/token`),

  // Remote debug
  startRemoteDebugSession: (
    id: string,
    data?: StartRemoteDebugSessionRequest,
  ) =>
    api.post<StartRemoteDebugSessionResponse>(
      `${BASE}/${id}/remote-debug/start`,
      data,
    ),

  stopRemoteDebugSession: (id: string, sessionId: string) =>
    api.post<void>(`${BASE}/${id}/remote-debug/${sessionId}/stop`),

  // Zero-touch approval
  approveZeroTouch: (agentId: string) =>
    api.post<ApproveZeroTouchResponse>(
      `/api/v1/agents/${agentId}/approve-zero-touch`,
    ),

  // Automation - run task/script on agent
  runAutomationTask: (agentId: string, taskId: string) =>
    api.post<Record<string, unknown>>(
      `/api/v1/agents/${agentId}/automation/tasks/${taskId}/run-now`,
    ),

  runAutomationScript: (agentId: string, scriptId: string) =>
    api.post<Record<string, unknown>>(
      `/api/v1/agents/${agentId}/automation/scripts/${scriptId}/run-now`,
    ),

  forceAutomationSync: (agentId: string, data: {
    policies?: boolean;
    inventory?: boolean;
    software?: boolean;
    appStore?: boolean;
  }) =>
    api.post<Record<string, unknown>>(
      `/api/v1/agents/${agentId}/automation/force-sync`,
      data,
    ),

  getAutomationExecutions: (agentId: string) =>
    api.get<unknown[]>(`/api/v1/agents/${agentId}/automation/executions`),
};
