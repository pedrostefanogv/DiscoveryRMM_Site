import { useMutation, useQuery } from "@tanstack/react-query";
import { agentAlertsApi } from "@/api";
import type { AgentAlertTestDispatchRequest } from "@/api";

const KEYS = {
  all: ["agent-alerts"] as const,
  scopeOptions: () => [...KEYS.all, "scope-options"] as const,
};

export function useAgentAlertScopeOptions() {
  return useQuery({
    queryKey: KEYS.scopeOptions(),
    queryFn: () => agentAlertsApi.getScopeOptions(),
  });
}

export function useAgentAlertTestDispatch() {
  return useMutation({
    mutationFn: (data: AgentAlertTestDispatchRequest) =>
      agentAlertsApi.testDispatch(data),
  });
}