import { ApiError, api, apiFetchResponse, parseErrorMessage } from "./client";
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

export interface ReopenTicketRequest {
  reason?: string | null;
}

export interface RateTicketRequest {
  rating: number;
  feedback?: string | null;
}

export type TicketRelationKind = "Duplicate" | "Blocks" | "RelatesTo" | "ParentOf" | "ChildOf";

export interface CreateTicketRelationRequest {
  targetTicketId: string;
  relationType: TicketRelationKind;
}

export interface TicketRelationDto {
  id: string;
  sourceTicketId: string;
  targetTicketId: string;
  relationType: string;
  createdBy: string | null;
  createdAt: string;
  direction?: string | null;
}

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

  // SLA
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

  /**
   * Baixa o anexo como blob (same-origin, com Authorization). O <a href> direto
   * não envia o header e o endpoint redirecionava para o storage (CORS).
   */
  downloadAttachment: async (
    ticketId: string,
    attachmentId: string,
  ): Promise<{ blob: Blob; fileName: string }> => {
    const response = await apiFetchResponse(
      `${BASE}/${ticketId}/attachments/${attachmentId}/download`,
      { method: "GET" },
    );

    if (!response.ok) {
      const message = await parseErrorMessage(response);
      throw new ApiError(response.status, message);
    }

    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") ?? "";
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const quotedMatch = disposition.match(/filename="([^"]+)"/i);
    let fileName = "anexo";
    if (utf8Match?.[1]) {
      try {
        fileName = decodeURIComponent(utf8Match[1]);
      } catch {
        fileName = utf8Match[1];
      }
    } else if (quotedMatch?.[1]) {
      fileName = quotedMatch[1];
    }

    return { blob, fileName };
  },

  // Lifecycle: reopen / rating (CSAT)
  reopen: (id: string, data: ReopenTicketRequest) =>
    api.post<Ticket>(`${BASE}/${id}/reopen`, data),

  rate: (id: string, data: RateTicketRequest) =>
    api.post<Ticket>(`${BASE}/${id}/rating`, data),

  // Relations
  listRelations: (id: string) =>
    api.get<TicketRelationDto[]>(`${BASE}/${id}/relations`),

  createRelation: (id: string, data: CreateTicketRelationRequest) =>
    api.post<TicketRelationDto>(`${BASE}/${id}/relations`, data),

  removeRelation: (id: string, relationId: string) =>
    api.del<void>(`${BASE}/${id}/relations/${relationId}`),
};
