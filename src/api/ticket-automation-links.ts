import { api } from "./client";
import type {
  CreateTicketAutomationLinkRequest,
  ReviewTicketAutomationLinkRequest,
  TicketAutomationLink,
} from "./types";

function basePath(ticketId: string) {
  return `/api/tickets/${ticketId}/automation-links`;
}

export const ticketAutomationLinksApi = {
  list: (ticketId: string) =>
    api.get<TicketAutomationLink[]>(basePath(ticketId)),

  create: (ticketId: string, data: CreateTicketAutomationLinkRequest) =>
    api.post<{ id: string; status: string | number }>(basePath(ticketId), data),

  approve: (
    ticketId: string,
    linkId: string,
    data: ReviewTicketAutomationLinkRequest,
  ) =>
    api.patch<{
      id: string;
      status: string | number;
      reviewedBy?: string | null;
      reviewedAt?: string | null;
    }>(`${basePath(ticketId)}/${linkId}/approve`, data),

  reject: (
    ticketId: string,
    linkId: string,
    data: ReviewTicketAutomationLinkRequest,
  ) =>
    api.patch<{
      id: string;
      status: string | number;
      reviewedBy?: string | null;
      reviewedAt?: string | null;
    }>(`${basePath(ticketId)}/${linkId}/reject`, data),
};