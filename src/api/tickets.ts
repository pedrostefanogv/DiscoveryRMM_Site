import { api } from "./client";
import type {
  Ticket,
  TicketAttachment,
  TicketComment,
  CreateTicketRequest,
  UpdateTicketRequest,
  UpdateWorkflowStateRequest,
  AddCommentRequest,
  TicketsQuery,
  PresignedUploadRequest,
  PresignedUploadResponse,
  CompleteUploadRequest,
} from "./types";

const BASE = "/api/tickets";

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

  // Audit / Timeline
  getTimeline: (ticketId: string) =>
    api.get<import("./types").TicketTimelineEntry[]>(
      `${BASE}/${ticketId}/audit/timeline`,
    ),

  getTimelineByActivityType: (ticketId: string, activityType: string) =>
    api.get<import("./types").TicketTimelineEntry[]>(
      `${BASE}/${ticketId}/audit/timeline/activity-type/${activityType}`,
    ),

  getTimelineByUser: (ticketId: string, userId: string) =>
    api.get<import("./types").TicketTimelineEntry[]>(
      `${BASE}/${ticketId}/audit/timeline/user/${userId}`,
    ),

  getTimelineDateRange: (ticketId: string, from: string, to: string) =>
    api.get<import("./types").TicketTimelineEntry[]>(
      `${BASE}/${ticketId}/audit/timeline/date-range`,
      { from, to },
    ),

  getLastTimeline: (ticketId: string) =>
    api.get<import("./types").TicketTimelineEntry>(
      `${BASE}/${ticketId}/audit/timeline/last`,
    ),

  getStatistics: (ticketId: string) =>
    api.get<import("./types").TicketStatistics>(
      `${BASE}/${ticketId}/audit/statistics`,
    ),

  // SLA
  getSlaStatus: (ticketId: string) =>
    api.get<import("./types").SlaStatus>(`${BASE}/${ticketId}/sla/status`),

  getSlaDetails: (ticketId: string) =>
    api.get<import("./types").SlaDetails>(`${BASE}/${ticketId}/sla/details`),

  // Attachments
  listAttachments: (ticketId: string) =>
    api.get<TicketAttachment[]>(`${BASE}/${ticketId}/attachments`),

  prepareUpload: (ticketId: string, data: PresignedUploadRequest) =>
    api.post<PresignedUploadResponse>(
      `${BASE}/${ticketId}/attachments/presigned-upload`,
      data,
    ),

  completeUpload: (ticketId: string, data: CompleteUploadRequest) =>
    api.post<TicketAttachment>(
      `${BASE}/${ticketId}/attachments/complete-upload`,
      data,
    ),
};
