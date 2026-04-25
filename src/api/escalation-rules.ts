import { api } from "./client";
import type {
  CreateEscalationRuleRequest,
  TicketEscalationRule,
  UpdateEscalationRuleRequest,
} from "./types";

const BASE = "/api/escalation-rules";

export const escalationRulesApi = {
  list: () => api.get<TicketEscalationRule[]>(BASE),

  listByWorkflowProfile: (workflowProfileId: string) =>
    api.get<TicketEscalationRule[]>(`${BASE}/by-profile/${workflowProfileId}`),

  get: (id: string) => api.get<TicketEscalationRule>(`${BASE}/${id}`),

  create: (data: CreateEscalationRuleRequest) =>
    api.post<TicketEscalationRule>(BASE, data),

  update: (id: string, data: UpdateEscalationRuleRequest) =>
    api.put<TicketEscalationRule>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};