import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  keepPreviousData,
} from "@tanstack/react-query";
import { ApiError, agentsApi } from "@/api";
import { LISTENING_PORTS_BACKEND_LIMIT, OPEN_SOCKETS_BACKEND_LIMIT } from "@/api/backendLimits";
import type {
  AgentSoftwareInventoryPage,
  AgentSoftwareOrder,
  UpdateAgentRequest,
  SendCommandRequest,
  CreateTokenRequest,
  RestartRequest,
  ShutdownRequest,
  WakeOnLanRequest,
  StartupItemActionRequest,
  ScheduledTaskActionRequest,
} from "@/api";

const KEYS = {
  all: ["agents"] as const,
  byClient: (clientId: string) => [...KEYS.all, "byClient", clientId] as const,
  bySite: (siteId: string) => [...KEYS.all, "bySite", siteId] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  hardware: (id: string) => [...KEYS.all, "hardware", id] as const,
  software: (
    id: string,
    params: {
      cursor?: string;
      limit: number;
      search: string;
      order: AgentSoftwareOrder;
    },
  ) => [...KEYS.all, "software", id, params] as const,
  softwarePage: (
    id: string,
    params: { page: number; pageSize: number; search: string; order: AgentSoftwareOrder },
  ) => [...KEYS.all, "softwarePage", id, params] as const,
  softwareSnapshot: (id: string) =>
    [...KEYS.all, "softwareSnapshot", id] as const,
  hardwareComponents: (id: string) =>
    [...KEYS.all, "hardwareComponents", id] as const,
  listeningPortsPage: (
    id: string,
    params: { cursor?: string; limit: number; search: string },
  ) => [...KEYS.all, "listeningPortsPage", id, params] as const,
  openSocketsPage: (
    id: string,
    params: { cursor?: string; limit: number; search: string },
  ) => [...KEYS.all, "openSocketsPage", id, params] as const,
  commands: (id: string) => [...KEYS.all, "commands", id] as const,
  tokens: (id: string) => [...KEYS.all, "tokens", id] as const,
};

/**
 * Guard contra loop infinito de paginação por cursor: recusa um nextCursor
 * igual ao cursor de entrada. Se o backend repetir o cursor (ex.: decode
 * falhando e ignorando o cursor), a infinite query buscaria a mesma página
 * para sempre — este guard encerra a iteração. Regression: detalhe do agente.
 */
export function agentSoftwareNextCursorGuard(
  lastPage: Pick<AgentSoftwareInventoryPage, "nextCursor" | "cursor">,
): string | undefined {
  const { nextCursor, cursor } = lastPage;
  return nextCursor && nextCursor !== cursor ? nextCursor : undefined;
}

const DELETE_AGENT_DEPENDENCY_ERROR_TOKENS = [
  "foreign key",
  "constraint",
  "reference constraint",
  "deletebehavior.restrict",
  "delete behavior restrict",
  "violates",
  "23503",
];

function isLikelyDeleteDependencyError(message: string): boolean {
  const normalized = message.toLowerCase();
  return DELETE_AGENT_DEPENDENCY_ERROR_TOKENS.some((token) =>
    normalized.includes(token),
  );
}

function isGenericInternalError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "erro interno do servidor" ||
    normalized === "internal server error" ||
    normalized.includes("an error occurred while processing your request")
  );
}

export function getDeleteAgentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return "ID de agente inválido. Use um GUID válido em /api/v1/agents/{id}.";
    }

    if (error.status === 401) {
      return "Não autenticado para excluir agente. Valide sessão/JWT, MFA concluído ou API key (X-Api-Key + X-Api-Secret).";
    }

    if (error.status === 404) {
      return "Endpoint de exclusão não encontrado. Use DELETE /api/v1/agents/{id}.";
    }

    if (error.status === 500) {
      if (
        isLikelyDeleteDependencyError(error.message) ||
        isGenericInternalError(error.message)
      ) {
        return "Não foi possível excluir o agente porque existem vínculos ativos (FK), como tickets, tokens, inventário ou comandos.";
      }
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Falha ao excluir o agente.";
}

export function useAgentsByClient(clientId: string) {
  return useQuery({
    queryKey: KEYS.byClient(clientId),
    queryFn: ({ signal }) => agentsApi.listByClient(clientId, { signal }),
    enabled: !!clientId,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
}

export function useAgentsBySite(siteId: string) {
  return useQuery({
    queryKey: KEYS.bySite(siteId),
    queryFn: ({ signal }) => agentsApi.listBySite(siteId, { signal }),
    enabled: !!siteId,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
}

export function useAgent(id: string | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: ({ signal }) => agentsApi.get(id!, { signal }),
    enabled: !!id,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
}

export function useAgentHardware(id: string) {
  return useQuery({
    queryKey: KEYS.hardware(id),
    queryFn: ({ signal }) => agentsApi.getHardware(id, { signal }),
    enabled: !!id,
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });
}

export function useAgentSoftware(
  id: string,
  params?: {
    limit?: number;
    search?: string;
    order?: AgentSoftwareOrder;
  },
) {
  const safeLimit = Math.min(500, Math.max(1, params?.limit ?? 50));
  const safeSearch = params?.search?.trim() ?? "";
  const safeOrder: AgentSoftwareOrder =
    params?.order === "asc" ? "asc" : "desc";

  return useInfiniteQuery({
    queryKey: KEYS.software(id, {
      cursor: undefined,
      limit: safeLimit,
      search: safeSearch,
      order: safeOrder,
    }),
    queryFn: ({ pageParam }) =>
      agentsApi.getSoftware(id, {
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit: safeLimit,
        search: safeSearch,
        order: safeOrder,
      }),
    initialPageParam: undefined as string | undefined,
    // Guard + maxPages: encerra a iteração se o backend repetir o cursor
    // (defesa em profundidade contra regressão do loop infinito).
    getNextPageParam: agentSoftwareNextCursorGuard,
    maxPages: 20,
    enabled: !!id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Paginação server-side por offset (GET /agents/{id}/software/page) —
 * busca apenas a página visível com total filtrado. Preferir este hook ao
 * fetch-all por cursor no detalhe do agente.
 */
export function useAgentSoftwarePage(
  id: string,
  params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    order?: AgentSoftwareOrder;
  },
) {
  const safePage = Math.max(1, params?.page ?? 1);
  const safePageSize = Math.min(2000, Math.max(1, params?.pageSize ?? 50));
  const safeSearch = params?.search?.trim() ?? "";
  const safeOrder: AgentSoftwareOrder =
    params?.order === "asc" ? "asc" : "desc";

  return useQuery({
    queryKey: KEYS.softwarePage(id, {
      page: safePage,
      pageSize: safePageSize,
      search: safeSearch,
      order: safeOrder,
    }),
    queryFn: ({ signal }) =>
      agentsApi.getSoftwarePage(
        id,
        {
          page: safePage,
          pageSize: safePageSize,
          search: safeSearch,
          order: safeOrder,
        },
        { signal },
      ),
    enabled: !!id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useAgentSoftwareSnapshot(id: string) {
  return useQuery({
    queryKey: KEYS.softwareSnapshot(id),
    queryFn: () => agentsApi.getSoftwareSnapshot(id),
    enabled: !!id,
  });
}

export function useAgentHardwareComponents(
  id: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: KEYS.hardwareComponents(id),
    queryFn: () => agentsApi.getHardwareComponents(id),
    // Payload pesado (impressoras/discos/startup/tarefas) — carregar sob
    // demanda quando a aba correspondente estiver ativa. Portas e conexões
    // têm endpoints próprios paginados por cursor (abaixo) e não passam por aqui.
    enabled: !!id && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

/**
 * Paginação por cursor (ponteiro) das portas em escuta do agente.
 * O chamador gerencia o cursor (pilha de navegação) e o limite; o backend
 * devolve a página, o total filtrado e o próximo ponteiro.
 */
export function useAgentListeningPortsPage(
  id: string,
  params?: { cursor?: string; limit?: number; search?: string },
) {
  const safeLimit = Math.min(LISTENING_PORTS_BACKEND_LIMIT, Math.max(1, params?.limit ?? 50));
  const safeSearch = params?.search?.trim() ?? "";

  return useQuery({
    queryKey: KEYS.listeningPortsPage(id, {
      cursor: params?.cursor,
      limit: safeLimit,
      search: safeSearch,
    }),
    queryFn: ({ signal }) =>
      agentsApi.getListeningPortsPage(
        id,
        { cursor: params?.cursor, limit: safeLimit, search: safeSearch },
        { signal },
      ),
    enabled: !!id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Paginação por cursor (ponteiro) das conexões abertas do agente, incluindo o
 * estado TCP de cada conexão. O chamador gerencia o cursor e o limite.
 */
export function useAgentOpenSocketsPage(
  id: string,
  params?: { cursor?: string; limit?: number; search?: string },
) {
  const safeLimit = Math.min(OPEN_SOCKETS_BACKEND_LIMIT, Math.max(1, params?.limit ?? 50));
  const safeSearch = params?.search?.trim() ?? "";

  return useQuery({
    queryKey: KEYS.openSocketsPage(id, {
      cursor: params?.cursor,
      limit: safeLimit,
      search: safeSearch,
    }),
    queryFn: ({ signal }) =>
      agentsApi.getOpenSocketsPage(
        id,
        { cursor: params?.cursor, limit: safeLimit, search: safeSearch },
        { signal },
      ),
    enabled: !!id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useAgentCommands(id: string, limit = 50) {
  return useQuery({
    queryKey: KEYS.commands(id),
    queryFn: () => agentsApi.listCommands(id, limit),
    enabled: !!id,
  });
}

/**
 * Habilita/desabilita um item de inicialização do Windows no agent.
 * Invalida os componentes de hardware (startupItems) e o histórico de
 * comandos após o dispatch — o resultado final chega pela re-coleta que o
 * agent faz automaticamente após executar a ação.
 */
export function useAgentStartupItemAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StartupItemActionRequest) =>
      agentsApi.startupItemAction(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.hardwareComponents(id) });
      qc.invalidateQueries({ queryKey: KEYS.commands(id) });
    },
  });
}

/**
 * Executa uma ação sobre uma tarefa agendada (habilitar, desabilitar,
 * executar agora, excluir ou editar gatilho/ação) e invalida os caches
 * relacionados (tarefas agendadas + comandos).
 */
export function useAgentScheduledTaskAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ScheduledTaskActionRequest) =>
      agentsApi.scheduledTaskAction(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.hardwareComponents(id) });
      qc.invalidateQueries({ queryKey: KEYS.commands(id) });
    },
  });
}

export function useAgentTokens(id: string) {
  return useQuery({
    queryKey: KEYS.tokens(id),
    queryFn: () => agentsApi.listTokens(id),
    enabled: !!id,
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAgentRequest }) =>
      agentsApi.update(id, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useSendCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SendCommandRequest }) =>
      agentsApi.sendCommand(id, data),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.commands(vars.id) }),
  });
}

export function useCreateAgentToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateTokenRequest }) =>
      agentsApi.createToken(id, data),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.tokens(vars.id) }),
  });
}

export function useApproveZeroTouch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => agentsApi.approveZeroTouch(agentId),
    onSuccess: (_d, agentId) => {
      qc.invalidateQueries({ queryKey: KEYS.detail(agentId) });
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useRestartAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: RestartRequest }) =>
      agentsApi.restart(id, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.commands(vars.id) });
    },
  });
}

export function useShutdownAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: ShutdownRequest }) =>
      agentsApi.shutdown(id, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.commands(vars.id) });
    },
  });
}

export function useWakeOnLan() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: WakeOnLanRequest }) =>
      agentsApi.wakeOnLan(id, data),
  });
}
