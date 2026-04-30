import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentAlertsApi } from "@/api";
import type {
  AgentAlertsQuery,
  AgentAlertTestDispatchRequest,
  CreateAgentAlertRequest,
} from "@/api";

const KEYS = {
  all: ["agent-alerts"] as const,
  list: (params: AgentAlertsQuery) => [...KEYS.all, "list", params] as const,
  scopeOptions: () => [...KEYS.all, "scope-options"] as const,
};

export function useAgentAlerts(params: AgentAlertsQuery = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => agentAlertsApi.list(params),
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