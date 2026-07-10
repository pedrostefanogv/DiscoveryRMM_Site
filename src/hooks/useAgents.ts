import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { ApiError, agentsApi } from "@/api";
import type {
  AgentSoftwareOrder,
  UpdateAgentRequest,
  SendCommandRequest,
  CreateTokenRequest,
  RestartRequest,
  ShutdownRequest,
  WakeOnLanRequest,
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
  softwareSnapshot: (id: string) =>
    [...KEYS.all, "softwareSnapshot", id] as const,
  commands: (id: string) => [...KEYS.all, "commands", id] as const,
  tokens: (id: string) => [...KEYS.all, "tokens", id] as const,
};

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
    queryFn: () => agentsApi.listByClient(clientId),
    enabled: !!clientId,
    refetchInterval: 300_000,
    refetchIntervalInBackground: true,
  });
}

export function useAgentsBySite(siteId: string) {
  return useQuery({
    queryKey: KEYS.bySite(siteId),
    queryFn: () => agentsApi.listBySite(siteId),
    enabled: !!siteId,
    refetchInterval: 300_000,
    refetchIntervalInBackground: true,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => agentsApi.get(id),
    enabled: !!id,
    refetchInterval: 300_000,
    refetchIntervalInBackground: true,
  });
}

export function useAgentHardware(id: string) {
  return useQuery({
    queryKey: KEYS.hardware(id),
    queryFn: () => agentsApi.getHardware(id),
    enabled: !!id,
  });
}

export function useAgentSoftware(
  id: string,
  params?: {
    cursor?: string;
    limit?: number;
    search?: string;
    order?: AgentSoftwareOrder;
  },
) {
  const safeLimit = Math.min(500, Math.max(1, params?.limit ?? 100));
  const safeSearch = params?.search?.trim() ?? "";
  const safeOrder: AgentSoftwareOrder =
    params?.order === "asc" ? "asc" : "desc";

  return useQuery({
    queryKey: KEYS.software(id, {
      cursor: params?.cursor,
      limit: safeLimit,
      search: safeSearch,
      order: safeOrder,
    }),
    queryFn: () =>
      agentsApi.getSoftware(id, {
        cursor: params?.cursor,
        limit: safeLimit,
        search: safeSearch,
        order: safeOrder,
      }),
    enabled: !!id,
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

export function useAgentCommands(id: string, limit = 50) {
  return useQuery({
    queryKey: KEYS.commands(id),
    queryFn: () => agentsApi.listCommands(id, limit),
    enabled: !!id,
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
