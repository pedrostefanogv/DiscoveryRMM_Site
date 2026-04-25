import { api } from "./client";
import type { TicketAlertRule, UpsertTicketAlertRuleRequest } from "./types";

const BASE = "/api/ticket-alert-rules";

export const ticketAlertRulesApi = {
  list: () => api.get<TicketAlertRule[]>(BASE),

  get: (id: string) => api.get<TicketAlertRule>(`${BASE}/${id}`),

  listByWorkflowState: (workflowStateId: string) =>
    api.get<TicketAlertRule[]>(`${BASE}/by-workflow-state/${workflowStateId}`),

  create: (data: UpsertTicketAlertRuleRequest) =>
    api.post<TicketAlertRule>(BASE, data),

  update: (id: string, data: UpsertTicketAlertRuleRequest) =>
    api.put<TicketAlertRule>(`${BASE}/${id}`, data),

  toggle: (id: string) =>
    api.patch<{ id: string; isEnabled: boolean }>(`${BASE}/${id}/toggle`, {}),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};