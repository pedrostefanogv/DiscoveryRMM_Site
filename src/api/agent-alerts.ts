import { api } from "./client";
import type {
  AgentAlertScopeOptionsResponse,
  AgentAlertTestDispatchRequest,
  AgentAlertTestDispatchResponse,
} from "./types";

const BASE = "/api/agent-alerts";

export const agentAlertsApi = {
  getScopeOptions: () =>
    api.get<AgentAlertScopeOptionsResponse>(`${BASE}/scope-options`),

  testDispatch: (data: AgentAlertTestDispatchRequest) =>
    api.post<AgentAlertTestDispatchResponse>(`${BASE}/test-dispatch`, data),
};