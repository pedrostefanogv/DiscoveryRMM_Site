import { api } from "./client";
import type {
  Ticket,
  TicketComment,
  CreateTicketRequest,
  UpdateTicketRequest,
  UpdateWorkflowStateRequest,
  AddCommentRequest,
  TicketsQuery,
} from "./types";

const BASE = "/api/Tickets";

export const ticketsApi = {
  list: (params: TicketsQuery = {}) =>
    api.get<Ticket[]>(BASE, params as Record<string, unknown>),

  listByClient: (clientId: string, workflowStateId?: string) =>
    api.get<Ticket[]>(`${BASE}/by-client/${clientId}`, { workflowStateId }),

  get: (id: string) => api.get<Ticket>(`${BASE}/${id}`),

  create: (data: CreateTicketRequest) => api.post<Ticket>(BASE, data),

  update: (id: string, data: UpdateTicketRequest) =>
    api.put<Ticket>(`${BASE}/${id}`, data),

  updateWorkflowState: (id: string, data: UpdateWorkflowStateRequest) =>
    api.patch<void>(`${BASE}/${id}/workflow-state`, data),

  // Comments
  listComments: (id: string) =>
    api.get<TicketComment[]>(`${BASE}/${id}/comments`),

  addComment: (id: string, data: AddCommentRequest) =>
    api.post<TicketComment>(`${BASE}/${id}/comments`, data),
};
