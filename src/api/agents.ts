import { api, type ApiRequestInit } from "./client";
import type { AgentHeartbeat } from "./realtime";
import type {
  Agent,
  AgentHardwareInfo,
  DiskInfo,
  StartupItemInfo,
  ScheduledTaskInfo,
  StartupItemActionRequest,
  ScheduledTaskActionRequest,
  NetworkAdapterInfo,
  MemoryModuleInfo,
  ListeningPortInfo,
  OpenSocketInfo,
  AgentListeningPortsPage,
  AgentOpenSocketsPage,
  PrinterInfo,
  AgentSoftwareInventoryPage,
  AgentSoftwareInventorySnapshot,
  AgentSoftwarePage,
  AgentSoftwareOrder,
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

export interface HardwareComponentsResponse {
  printers: PrinterInfo[];
  listeningPorts: ListeningPortInfo[];
  openSockets: OpenSocketInfo[];
  disks: DiskInfo[];
  networkAdapters: NetworkAdapterInfo[];
  memoryModules: MemoryModuleInfo[];
  startupItems: StartupItemInfo[];
  scheduledTasks: ScheduledTaskInfo[];
  collectedAt: string;
}

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
  listBySite: (siteId: string, init?: ApiRequestInit) =>
    api.get<Agent[]>(`${BASE}/by-site/${siteId}`, {}, init),

  listByClient: (clientId: string, init?: ApiRequestInit) =>
    api.get<Agent[]>(`${BASE}/by-client/${clientId}`, {}, init),

  get: (id: string, init?: ApiRequestInit) =>
    api.get<Agent>(`${BASE}/${id}`, {}, init),

  create: (data: CreateAgentRequest) => api.post<Agent>(BASE, data),

  update: (id: string, data: UpdateAgentRequest) =>
    api.put<Agent>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),

  // Hardware
  getHardware: (id: string, init?: ApiRequestInit) =>
    api.get<HardwareReport>(`${BASE}/${id}/hardware`, {}, init),

  getHardwareComponents: (id: string, params?: { includeNetwork?: boolean }) =>
    api.get<HardwareComponentsResponse>(`${BASE}/${id}/hardware/components`, {
      includeNetwork: params?.includeNetwork,
    }),

  // Portas em escuta — paginação por cursor (ponteiro) sobre o snapshot de
  // componentes; o browser carrega uma página por vez em vez da lista inteira.
  getListeningPortsPage: (
    id: string,
    params?: { cursor?: string; limit?: number; search?: string },
    init?: ApiRequestInit,
  ) =>
    api.get<AgentListeningPortsPage>(`${BASE}/${id}/hardware/network/ports`, {
      cursor: params?.cursor,
      limit: params?.limit,
      search: params?.search,
    }, init),

  // Conexões abertas — paginação por cursor (ponteiro) com estado TCP.
  getOpenSocketsPage: (
    id: string,
    params?: { cursor?: string; limit?: number; search?: string; state?: string },
    init?: ApiRequestInit,
  ) =>
    api.get<AgentOpenSocketsPage>(`${BASE}/${id}/hardware/network/sockets`, {
      cursor: params?.cursor,
      limit: params?.limit,
      search: params?.search,
      state: params?.state,
    }, init),

  reportHardware: (id: string, data: HardwareReportRequest) =>
    api.post<void>(`${BASE}/${id}/hardware`, data),

  // Software inventory — returns paginated CursorPageDto
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

  // Software inventory — paginação por offset com total filtrado (detalhe do agente)
  getSoftwarePage: (
    id: string,
    params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      order?: AgentSoftwareOrder;
    },
    init?: ApiRequestInit,
  ) =>
    api.get<AgentSoftwarePage>(
      `${BASE}/${id}/software/page`,
      {
        page: params?.page,
        pageSize: params?.pageSize,
        search: params?.search,
        order: params?.order,
      },
      init,
    ),

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
      startupItems?: boolean;
      scheduledTasks?: boolean;
    },
  ) =>
    api.post<{
      success: boolean;
      commandId: string;
      status: string;
      flags: Record<string, boolean>;
    }>(`${BASE}/${id}/refresh-data`, flags),

  // Software — dispara a atualização de um app instalado (winget/choco).
  // confirmUnapproved = true quando o app não é aprovado na loja e o operador
  // confirmou explicitamente (o servidor responde 409 sem essa confirmação).
  updateSoftware: (id: string, inventoryId: string, confirmUnapproved = false) =>
    api.post<{ success: boolean; dispatched: boolean }>(
      `${BASE}/${id}/software/${inventoryId}/update`,
      { confirmUnapproved },
    ),

  // Software — desinstala um app instalado (gerenciador → MSI → UninstallString).
  uninstallSoftware: (id: string, inventoryId: string) =>
    api.post<{ success: boolean; dispatched: boolean }>(
      `${BASE}/${id}/software/${inventoryId}/uninstall`,
      {},
    ),

  // Inicialização do Windows — habilitar/desabilitar item
  startupItemAction: (id: string, data: StartupItemActionRequest) =>
    api.post<{ success: boolean; dispatched: boolean }>(
      `${BASE}/${id}/startup-items/action`,
      data,
    ),

  // Tarefas agendadas — habilitar/desabilitar/executar/excluir/editar
  scheduledTaskAction: (id: string, data: ScheduledTaskActionRequest) =>
    api.post<{ success: boolean; dispatched: boolean }>(
      `${BASE}/${id}/scheduled-tasks/action`,
      data,
    ),
};
