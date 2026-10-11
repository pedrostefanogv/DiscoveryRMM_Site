import { api } from "./client";

// ─────────────────────────────────────────────────────────────────────────────
// Chat de suporte vinculado ao chamado (lado do console web).
//
// O conteúdo das mensagens chega por REST; o canal NATS de dashboard entrega
// apenas um SINAL sem corpo (TicketChatActivity) que dispara o fetch do delta.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "/api/v1/tickets";

export type TicketChatSessionStatus = "Pending" | "Active" | "Declined" | "Expired" | "Ended";

export type TicketChatAuthorKind = "Support" | "EndUser" | "System";

export interface TicketChatAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy?: string | null;
  createdAt?: string | null;
}

export interface TicketChatMessage {
  id: string;
  sequenceNumber: number;
  /** Chave de idempotência do emissor (casa a bolha otimista com a canônica). */
  clientMessageId?: string;
  authorKind: TicketChatAuthorKind | string;
  authorUserId?: string | null;
  authorName?: string | null;
  body: string;
  createdAt: string;
  attachments: TicketChatAttachment[];
}

export interface TicketChatSession {
  id: string;
  ticketId: string;
  agentId?: string | null;
  status: TicketChatSessionStatus | string;
  startedByUserId?: string | null;
  startedByName?: string | null;
  startedAt: string;
  inviteExpiresAt?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  declinedReason?: string | null;
  endedAt?: string | null;
  endedBy?: string | null;
  endReason?: string | null;
  lastMessageAt?: string | null;
  messageCount: number;
  messages?: TicketChatMessage[] | null;
}

export interface TicketChatState {
  hasSession: boolean;
  session?: TicketChatSession | null;
}

export interface SendTicketChatMessageRequest {
  body: string;
  attachmentIds?: string[];
  clientMessageId?: string | null;
}

export interface PresignedChatUploadResponse {
  attachmentId: string;
  objectKey: string;
  uploadUrl: string;
  httpMethod: string;
  expiresAtUtc?: string;
}

export interface CompleteChatUploadRequest {
  attachmentId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** Códigos de conflito devolvidos pelo start/retry (campo `code`). */
export type TicketChatConflictCode =
  | "ticket_has_no_agent"
  | "agent_offline"
  | "agent_busy"
  | "session_exists"
  | "session_not_pending"
  | "invite_expired"
  | "invite_cooldown"
  | "session_not_active";

export const ticketChatApi = {
  getCurrent: (ticketId: string) =>
    api.get<TicketChatState>(BASE + "/" + ticketId + "/chat/sessions/current"),

  history: (ticketId: string, skip = 0, take = 20) =>
    api.get<TicketChatSession[]>(
      BASE + "/" + ticketId + "/chat/sessions?skip=" + skip + "&take=" + take,
    ),

  listMessages: (ticketId: string, sessionId: string, afterSequence = 0, limit = 200) =>
    api.get<TicketChatMessage[]>(
      BASE + "/" + ticketId + "/chat/sessions/" + sessionId +
      "/messages?afterSequence=" + afterSequence + "&limit=" + limit,
    ),

  start: (ticketId: string) =>
    api.post<TicketChatSession>(BASE + "/" + ticketId + "/chat/sessions"),

  retryInvite: (ticketId: string, sessionId: string) =>
    api.post<TicketChatSession>(
      BASE + "/" + ticketId + "/chat/sessions/" + sessionId + "/invite/retry",
    ),

  sendMessage: (ticketId: string, sessionId: string, data: SendTicketChatMessageRequest) =>
    api.post<TicketChatMessage>(
      BASE + "/" + ticketId + "/chat/sessions/" + sessionId + "/messages",
      data,
    ),

  end: (ticketId: string, sessionId: string, reason = "support_closed") =>
    api.post<TicketChatSession>(
      BASE + "/" + ticketId + "/chat/sessions/" + sessionId + "/end",
      { reason },
    ),

  prepareUpload: (
    ticketId: string,
    sessionId: string,
    data: { fileName: string; contentType: string; sizeBytes: number },
  ) =>
    api.post<PresignedChatUploadResponse>(
      BASE + "/" + ticketId + "/chat/sessions/" + sessionId + "/attachments/presigned-upload",
      data,
    ),

  completeUpload: (ticketId: string, sessionId: string, data: CompleteChatUploadRequest) =>
    api.post<TicketChatAttachment>(
      BASE + "/" + ticketId + "/chat/sessions/" + sessionId + "/attachments/complete-upload",
      data,
    ),

  /** URL autenticada do anexo (o componente baixa como blob). */
  attachmentUrl: (ticketId: string, attachmentId: string) =>
    BASE + "/" + ticketId + "/chat/attachments/" + attachmentId,
};
