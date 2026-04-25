import { api } from "./client";
import type {
  CreateTicketSavedViewRequest,
  TicketSavedView,
  UpdateTicketSavedViewRequest,
} from "./types";

const BASE = "/api/ticket-saved-views";

export const ticketSavedViewsApi = {
  list: (userId?: string) =>
    api.get<TicketSavedView[]>(BASE, { userId }),

  get: (id: string) => api.get<TicketSavedView>(`${BASE}/${id}`),

  create: (data: CreateTicketSavedViewRequest) =>
    api.post<TicketSavedView>(BASE, data),

  update: (id: string, data: UpdateTicketSavedViewRequest) =>
    api.put<TicketSavedView>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};