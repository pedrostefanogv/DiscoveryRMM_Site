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

// Nota: TicketCapabilities é declarado neste arquivo (e reexportado abaixo).

const BASE = "/api/v1/tickets";

/**
 * Baixa um anexo como blob pela API autenticada (same-origin, com
 * Authorization). Um <a href> direto não envia o header e o endpoint antigo
 * redirecionava para o storage (bloqueado por CORS).
 */
async function downloadAttachmentBlob(
  url: string,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await apiFetchResponse(url, { method: "GET" });

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
}

export interface ReopenTicketRequest {
  reason?: string | null;
}

/**
 * Capacidades do ator sobre um chamado, calculadas pelo backend.
 * Espelha o endpoint GET /tickets/{id}/capabilities.
 */
export interface TicketCapabilities {
  canView: boolean;
  /** Tratar/atender: membro do time do departamento do chamado (ou acesso global). */
  canTreat: boolean;
  canEdit: boolean;
  canAssign: boolean;
  canMerge: boolean;
  canDelete: boolean;
  canExecuteRunbook: boolean;
  /** Notas internas só são visíveis a quem trata o chamado. */
  canSeeInternalNotes: boolean;
  /** Fechar: o time fecha qualquer chamado do depto; o solicitante só o próprio. */
  canClose: boolean;
  /**
   * Estados FINAIS que este usuário pode atingir. O solicitante só encerra —
   * não reabre nem move para outros estados — então a UI deve oferecer
   * exatamente estes destinos.
   */
  closableStateIds: string[];
  isRequester: boolean;
  isDepartmentTeamMember: boolean;
  /** true durante a fase de medição (negações são registradas, não aplicadas). */
  shadowMode: boolean;
  /**
   * true quando a ação foi liberada APENAS pelo modo de observação — ou seja,
   * a política negaria, mas o shadow concedeu para medir o impacto. Útil para
   * a UI sinalizar durante a transição.
   */
  grantedByShadow?: boolean;
  /** Motivo legível da negação (para explicar ao usuário por que não pode). */
  reason?: string | null;
  /** Código estável da negação (ex.: TICKET_NOT_IN_YOUR_TEAM). */
  code?: string | null;
}

export interface MergeTicketsRequest {
  /** Chamados que serão absorvidos pelo destino (nunca inclua o próprio destino). */
  sourceTicketIds: string[];
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
  /** Dados do OUTRO chamado (aditivo) para o console exibir título/status. */
  otherTicketId?: string | null;
  otherTicketTitle?: string | null;
  otherTicketIsClosed?: boolean | null;
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

  /**
   * O que o usuário autenticado PODE fazer NESTE chamado.
   *
   * A decisão vem do backend de propósito: o console não deve reimplementar a
   * regra de autorização (hoje são "membro do time do departamento" ou "abriu o
   * próprio chamado"), senão frontend e backend divergem e a UI mostra botão que
   * dá 403 — ou pior, esconde ação que o backend permitiria.
   */
  getCapabilities: (id: string) =>
    api.get<TicketCapabilities>(`${BASE}/${id}/capabilities`),

  /**
   * Departamentos em que o usuário é membro ativo do time. Alimenta a fila
   * "Meu time"; devolve lista vazia quando não há vínculo (não é erro).
   */
  getMyDepartments: () =>
    api.get<{ departmentIds: string[] }>(`${BASE}/my-departments`),

  create: (data: CreateTicketRequest) => api.post<Ticket>(BASE, data),

  update: (id: string, data: UpdateTicketRequest) =>
    api.put<Ticket>(`${BASE}/${id}`, data),

  // Envia "targetStateId" (contrato canônico do CQRS). Antes a console
  // enviava "workflowStateId" e o endpoint devolvia 400 em TODA troca de
  // estado. O backend aceita as duas grafias, mas o cliente envia a correta.
  updateWorkflowState: (id: string, data: UpdateWorkflowStateRequest) =>
    api.patch<void>(`${BASE}/${id}/workflow-state`, {
      targetStateId: data.workflowStateId,
    }),

  // Move o chamado para a lixeira (soft delete no backend).
  delete: (id: string) => api.del<void>(`${BASE}/${id}`),

  // Comments
  listComments: (id: string, params?: { cursor?: string; limit?: number }) =>
    api.get<CursorPageDto<TicketComment>>(
      `${BASE}/${id}/comments`,
      params ?? {},
    ),

  // O backend devolve AddTicketCommentResult({ commentId, createdAt }) — não o
  // TicketComment completo. O tipo aceita as duas grafias para o chamador
  // conseguir o id do comentário novo (necessário para anexar arquivos a ele).
  addComment: (id: string, data: AddCommentRequest) =>
    api.post<TicketComment & { commentId?: string }>(`${BASE}/${id}/comments`, data),

  /** Exclui (soft delete) um comentário: ele continua legível, marcado. */
  deleteComment: (id: string, commentId: string) =>
    api.del<TicketComment>(`${BASE}/${id}/comments/${commentId}`),

  // Anexos de COMENTÁRIO (conversa): mesmas duas etapas do anexo do chamado,
  // porém escopados ao comentário (EntityType "TicketComment" no backend).
  prepareCommentUpload: (
    id: string,
    commentId: string,
    data: PresignedUploadRequest,
  ) =>
    api.post<PresignedUploadResponse>(
      `${BASE}/${id}/comments/${commentId}/attachments/presigned-upload`,
      data,
    ),

  completeCommentUpload: (
    id: string,
    commentId: string,
    data: CompleteUploadRequest,
  ) =>
    api.post<TicketAttachment>(
      `${BASE}/${id}/comments/${commentId}/attachments/complete-upload`,
      data,
    ),

  downloadCommentAttachment: (
    id: string,
    commentId: string,
    attachmentId: string,
  ): Promise<{ blob: Blob; fileName: string }> =>
    downloadAttachmentBlob(
      `${BASE}/${id}/comments/${commentId}/attachments/${attachmentId}/download`,
    ),

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

  /**
   * Lista consolidada e paginada (repositório + conversa). Paginada no servidor:
   * a alternativa (comentários da 1ª página) omitia anexos de conversas antigas.
   */
  listAllAttachments: (
    ticketId: string,
    params?: { cursor?: string; limit?: number },
  ) =>
    api.get<CursorPageDto<import("./types").TicketAttachmentEntry>>(
      `${BASE}/${ticketId}/attachments/all`,
      params ?? {},
    ),

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
  downloadAttachment: (ticketId: string, attachmentId: string) =>
    downloadAttachmentBlob(
      `${BASE}/${ticketId}/attachments/${attachmentId}/download`,
    ),

  // Lifecycle: reopen / rating (CSAT)
  reopen: (id: string, data: ReopenTicketRequest) =>
    api.post<Ticket>(`${BASE}/${id}/reopen`, data),

  rate: (id: string, data: RateTicketRequest) =>
    api.post<Ticket>(`${BASE}/${id}/rating`, data),

  /**
   * Mescla chamados de ORIGEM neste chamado (destino).
   *
   * Backend: POST /tickets/{id}/merge (TicketsController.cs:330), que exige
   * ActionType.Edit no chamado destino E acesso a cada origem. A UI só oferece
   * a ação quando capabilities.canMerge é true — a checagem real é do servidor.
   */
  merge: (targetTicketId: string, data: MergeTicketsRequest) =>
    api.post<{ targetTicketId: string; mergedCount: number }>(
      `${BASE}/${targetTicketId}/merge`,
      data,
    ),

  // Relations
  listRelations: (id: string) =>
    api.get<TicketRelationDto[]>(`${BASE}/${id}/relations`),

  createRelation: (id: string, data: CreateTicketRelationRequest) =>
    api.post<TicketRelationDto>(`${BASE}/${id}/relations`, data),

  removeRelation: (id: string, relationId: string) =>
    api.del<void>(`${BASE}/${id}/relations/${relationId}`),
};
