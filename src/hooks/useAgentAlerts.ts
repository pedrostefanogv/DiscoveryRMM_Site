import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentAlertsApi } from "@/api";
import type {
  AgentAlertsQuery,
  AgentAlertTestDispatchRequest,
  CreateAgentAlertRequest,
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
