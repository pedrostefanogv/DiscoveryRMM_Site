import { api } from "./client";
import type { AgentHeartbeat } from "./realtime";
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
  AutomationExecutionReport,
  CreateAgentRequest,
  UpdateAgentRequest,
  SendCommandRequest,
  CreateTokenRequest,
  HardwareReportRequest,
  StartRemoteDebugSessionRequest,
  StartRemoteDebugSessionResponse,
  RemoteDebugNatsCredentialsResponse,
  TransferAgentRequest,
  TransferAgentResponse,
  TransferAgentBulkRequest,
  TransferBulkResult,
  ValidateTransferResponse,
  RestartRequest,
  ShutdownRequest,
  WakeOnLanRequest,
  WakeOnLanResponse,
  PowerCommandResponse,
} from "./types";

const BASE = "/api/v1/agents";

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

interface StartRemoteDebugSessionWireResponse extends Omit<
  StartRemoteDebugSessionResponse,
  "natsTenantSubject" | "natsWssUrl"
> {
  natsTenantSubject?: string | null;
  natsWssUrl?: string | null;
}

function normalizeStartRemoteDebugSessionResponse(
  session: StartRemoteDebugSessionWireResponse,
): StartRemoteDebugSessionResponse {
  const natsTenantSubject = session.natsTenantSubject ?? null;
  const natsWssUrl = session.natsWssUrl ?? null;

  const { natsTenantSubject: _t, natsWssUrl: _w, ...base } = session;

  return {
    ...base,
    natsTenantSubject,
    natsWssUrl,
  };
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
  startRemoteDebugSession: async (
    id: string,
    data?: StartRemoteDebugSessionRequest,
  ) => {
    const response = await api.post<StartRemoteDebugSessionWireResponse>(
      `${BASE}/${id}/remote-debug/start`,
      data,
    );

    return normalizeStartRemoteDebugSessionResponse(response);
  },

  stopRemoteDebugSession: (id: string, sessionId: string) =>
    api.post<void>(`${BASE}/${id}/remote-debug/${sessionId}/stop`),

  getRemoteDebugNatsCredentials: (id: string, sessionId: string) =>
    api.post<RemoteDebugNatsCredentialsResponse>(
      `${BASE}/${id}/remote-debug/${sessionId}/nats-credentials`,
    ),

  // Zero-touch approval
  approveZeroTouch: (agentId: string) =>
    api.post<ApproveZeroTouchResponse>(
      `/api/v1/agents/${agentId}/approve-zero-touch`,
    ),

  // Heartbeat do agente autenticado (fallback REST — métricas mais recentes do Redis).
  // ATENÇÃO: Este endpoint retorna o heartbeat do USUÁRIO/AGENTE AUTENTICADO,
  // NÃO de um agente arbitrário. Para heartbeat de agentes específicos, use
  // a heartbeatStore alimentada por NATS (useAgentHeartbeat).
  getMyHeartbeat: () =>
    api.get<AgentHeartbeat>(`/api/v1/agent-auth/me/heartbeat`),

  // Automation - run task/script on agent
  runAutomationTask: (agentId: string, taskId: string) =>
    api.post<Record<string, unknown>>(
      `/api/v1/agents/${agentId}/automation/tasks/${taskId}/run-now`,
    ),

  runAutomationScript: (agentId: string, scriptId: string) =>
    api.post<Record<string, unknown>>(
      `/api/v1/agents/${agentId}/automation/scripts/${scriptId}/run-now`,
    ),

  forceAutomationSync: (
    agentId: string,
    data: {
      policies?: boolean;
      inventory?: boolean;
      software?: boolean;
      appStore?: boolean;
    },
  ) =>
    api.post<Record<string, unknown>>(
      `/api/v1/agents/${agentId}/automation/force-sync`,
      data,
    ),

  getAutomationExecutions: (agentId: string, limit = 50) =>
    api.get<AutomationExecutionReport[]>(
      `/api/v1/agents/${agentId}/automation/executions`,
      { limit },
    ),

  // Transfer
  transfer: (agentId: string, data: TransferAgentRequest) =>
    api.post<TransferAgentResponse>(`${BASE}/${agentId}/transfer`, data),

  transferBulk: (data: TransferAgentBulkRequest) =>
    api.post<TransferBulkResult>(`${BASE}/transfer/bulk`, data),

  validateTransfer: (agentId: string, targetSiteId: string) =>
    api.get<ValidateTransferResponse>(
      `${BASE}/${agentId}/validate-transfer?targetSiteId=${targetSiteId}`,
    ),

  // Power management
  restart: (id: string, data?: RestartRequest) =>
    api.post<PowerCommandResponse>(`${BASE}/${id}/restart`, data ?? {}),

  shutdown: (id: string, data?: ShutdownRequest) =>
    api.post<PowerCommandResponse>(`${BASE}/${id}/shutdown`, data ?? {}),

  wakeOnLan: (id: string, data?: WakeOnLanRequest) =>
    api.post<WakeOnLanResponse>(`${BASE}/${id}/wake-on-lan`, data ?? {}),

  // On-demand data refresh (ports, connections, software, printers, hardware)
  refreshData: (
    id: string,
    flags: {
      listeningPorts?: boolean;
      openConnections?: boolean;
      software?: boolean;
      printers?: boolean;
      hardware?: boolean;
    },
  ) =>
    api.post<{
      success: boolean;
      commandId: string;
      status: string;
      flags: Record<string, boolean>;
    }>(`${BASE}/${id}/refresh-data`, flags),
};
