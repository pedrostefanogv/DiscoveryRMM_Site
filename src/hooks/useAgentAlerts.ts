import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentAlertsApi } from "@/api";
import type {
  AgentAlertsQuery,
  AgentAlertTestDispatchRequest,
  CreateAgentAlertRequest,
  SendAgentNotificationRequest,
  SendScopeNotificationRequest,
  SendScopeNotificationResponse,
} from "@/api";

const KEYS = {
  all: ["agent-alerts"] as const,
  listPage: (params: AgentAlertsQuery) =>
    [...KEYS.all, "page", params] as const,
  scopeOptions: () => [...KEYS.all, "scope-options"] as const,
};

/** @deprecated O endpoint base /agent-alerts foi removido. Use listPage via agendamento/alerts page. */
export function useAgentAlerts(params: AgentAlertsQuery = {}) {
  return useQuery({
    queryKey: KEYS.listPage(params),
    queryFn: () => agentAlertsApi.listPage(params as Record<string, unknown>),
  });
}

export function useAgentAlertScopeOptions() {
  return useQuery({
    queryKey: KEYS.scopeOptions(),
    queryFn: () => agentAlertsApi.getScopeOptions(),
  });
}

export function useCreateAgentAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateAgentAlertRequest) => agentAlertsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useAgentAlertTestDispatch() {
  return useMutation({
    mutationFn: (data: AgentAlertTestDispatchRequest) =>
      agentAlertsApi.testDispatch(data),
  });
}

/**
 * Envia uma notificação avulsa (prompt PSADT/toast) para o usuário da máquina
 * do agent. Não invalida a lista de alertas porque não cria um alerta agendado.
 */
export function useSendAgentNotification() {
  return useMutation({
    mutationFn: (data: SendAgentNotificationRequest) =>
      agentAlertsApi.sendNotification(data),
  });
}

/**
 * Broadcast de notificação para todos os agents de um escopo (cliente, site,
 * label ou agent). Devolve as contagens de entrega para feedback na UI.
 */
export function useSendScopeNotification() {
  return useMutation<
    SendScopeNotificationResponse,
    Error,
    SendScopeNotificationRequest
  >({
    mutationFn: (data) => agentAlertsApi.sendScopeNotification(data),
  });
}
