import { api } from "./client";
import type {
  Ticket,
  TicketAttachment,
  TicketComment,
  TicketRemoteSession,
  TicketWatcher,
  CreateTicketRequest,
  UpdateTicketRequest,
  UpdateWorkflowStateRequest,
  AddCommentRequest,
  AddTicketWatcherRequest,
  EndTicketRemoteSessionRequest,
  TicketsQuery,
  PresignedUploadRequest,
  PresignedUploadResponse,
  CompleteUploadRequest,
  StartTicketRemoteSessionRequest,
  CursorPageDto,
} from "./types";

const BASE = "/api/v1/tickets";

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeTicketRemoteSession(
  raw: Record<string, unknown>,
  ticketId: string,
): TicketRemoteSession {
  return {
    id: String(raw.id ?? raw.sessionId ?? ""),
    ticketId: String(raw.ticketId ?? ticketId),
    agentId: normalizeNullableString(raw.agentId),
    meshNodeId: normalizeNullableString(raw.meshNodeId),
    sessionUrl: normalizeNullableString(raw.sessionUrl ?? raw.url),
    startedBy: normalizeNullableString(raw.startedBy),
    note: normalizeNullableString(raw.note),
    startedAt: normalizeNullableString(raw.startedAt ?? raw.createdAt),
    endedAt: normalizeNullableString(raw.endedAt),
    endedBy: normalizeNullableString(raw.endedBy),
    endNote: normalizeNullableString(raw.endNote),
    status: normalizeNullableString(raw.status),
    createdAt: normalizeNullableString(raw.createdAt),
    updatedAt: normalizeNullableString(raw.updatedAt),
  };
}

function normalizeTicketRemoteSessions(
  raw: unknown,
  ticketId: string,
): TicketRemoteSession[] {
  if (Array.isArray(raw)) {
    return raw.map((item) =>
      normalizeTicketRemoteSession(item as Record<string, unknown>, ticketId),
    );
  }

  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const collection = Array.isArray(record.items)
      ? record.items
      : Array.isArray(record.sessions)
        ? record.sessions
        : [];

    return collection.map((item) =>
      normalizeTicketRemoteSession(item as Record<string, unknown>, ticketId),
    );
  }

  return [];
}

export const ticketsApi = {
  list: (params: TicketsQuery = {}) =>
    api.get<CursorPageDto<Ticket>>(BASE, params as Record<string, unknown>),

  listByClient: (clientId: string, workflowStateId?: string) =>
    api.get<Ticket[]>(`${BASE}/by-client/${clientId}`, { workflowStateId }),

  get: (id: string) => api.get<Ticket>(`${BASE}/${id}`),

  create: (data: CreateTicketRequest) => api.post<Ticket>(BASE, data),

  update: (id: string, data: UpdateTicketRequest) =>
    api.put<Ticket>(`${BASE}/${id}`, data),

  updateWorkflowState: (id: string, data: UpdateWorkflowStateRequest) =>
    api.patch<void>(`${BASE}/${id}/workflow-state`, data),

  // Comments
  listComments: (id: string, params?: { cursor?: string; limit?: number }) =>
    api.get<CursorPageDto<TicketComment>>(
      `${BASE}/${id}/comments`,
      params ?? {},
    ),

  addComment: (id: string, data: AddCommentRequest) =>
    api.post<TicketComment>(`${BASE}/${id}/comments`, data),

  // Watchers
  listWatchers: (ticketId: string) =>
    api.get<TicketWatcher[]>(`${BASE}/${ticketId}/watchers`),

  addWatcher: (ticketId: string, data: AddTicketWatcherRequest) =>
    api.post<TicketWatcher>(`${BASE}/${ticketId}/watchers`, data),

  removeWatcher: (ticketId: string, userId: string) =>
    api.del<void>(`${BASE}/${ticketId}/watchers/${userId}`),

  // Remote sessions
  async listRemoteSessions(ticketId: string): Promise<TicketRemoteSession[]> {
    const raw = await api.get<unknown>(`${BASE}/${ticketId}/remote-sessions`);
    return normalizeTicketRemoteSessions(raw, ticketId);
  },

  async startRemoteSession(
    ticketId: string,
    data: StartTicketRemoteSessionRequest,
  ): Promise<TicketRemoteSession> {
    const raw = await api.post<Record<string, unknown>>(
      `${BASE}/${ticketId}/remote-sessions`,
      data,
    );
    return normalizeTicketRemoteSession(raw, ticketId);
  },

  async endRemoteSession(
    ticketId: string,
    sessionId: string,
    data: EndTicketRemoteSessionRequest,
  ): Promise<TicketRemoteSession> {
    const raw = await api.patch<Record<string, unknown>>(
      `${BASE}/${ticketId}/remote-sessions/${sessionId}/end`,
      data,
    );
    return normalizeTicketRemoteSession(raw, ticketId);
  },

  // Audit / Timeline
  getTimeline: (ticketId: string) =>
    api.get<import("./types").TicketTimelineEntry[]>(
      `${BASE}/${ticketId}/audit/timeline`,
    ),

  getUnifiedTimeline: (ticketId: string) =>
    api.get<import("./types").TicketTimelineEntry[]>(
      `${BASE}/${ticketId}/audit/timeline/unified`,
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
    api.get<CursorPageDto<TicketAttachment>>(`${BASE}/${ticketId}/attachments`),

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
