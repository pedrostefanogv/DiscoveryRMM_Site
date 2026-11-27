import type { DashboardEvent } from "@/api/nats";
import {
  ticketChatApi,
  type CompleteChatUploadRequest,
  type LinkSupportChatToTicketRequest,
  type PresignedChatUploadResponse,
  type SendTicketChatMessageRequest,
  type TicketChatAssistedActionType,
  type TicketChatAttachment,
  type TicketChatMessage,
  type TicketChatSession,
  type TicketChatState,
} from "@/api/ticket-chat";
import { supportChatApi } from "@/api/support-chat";
import { ticketChatEventIds } from "@/hooks/useTicketChatRealtime";
import { openTicketChatWindow } from "@/pages/tickets/ticketChatLauncher";

// ─────────────────────────────────────────────────────────────────────────────
// Camada de dados do chat de suporte.
//
// O mesmo painel atende as duas entradas do recurso:
//   - conversa vinculada a CHAMADO (ticket + janela /tickets/:id/chat);
//   - conversa AVULSA da MÁQUINA (agent + janela /agents/:id/support-chat).
// O que muda é apenas COMO a sessão corrente é obtida/iniciada e COMO o sinal
// NATS é casado — daí a abstração abaixo.
// ─────────────────────────────────────────────────────────────────────────────

export interface SupportChatRealtimeScope {
  clientId?: string | null;
  siteId?: string | null;
}

export interface SupportChatClient {
  /** Chave estável das queries (ticket:<id> | agent:<id>). */
  key: string;
  /** Escopo do canal NATS (dashboard) usado para o sinal de atividade. */
  realtimeScope: SupportChatRealtimeScope;
  /** O sinal sem corpo é desta conversa? */
  matchesRealtimeEvent: (
    event: DashboardEvent | Record<string, unknown> | null | undefined,
    sessionId: string | undefined,
  ) => boolean;

  getCurrent: () => Promise<TicketChatState>;
  listMessages: (
    sessionId: string,
    afterSequence?: number,
    limit?: number,
    beforeSequence?: number,
  ) => Promise<TicketChatMessage[]>;
  start: () => Promise<TicketChatSession>;
  retryInvite: (sessionId: string) => Promise<TicketChatSession>;
  sendMessage: (sessionId: string, data: SendTicketChatMessageRequest) => Promise<TicketChatMessage>;
  sendTyping: (sessionId: string, isTyping: boolean) => Promise<void>;
  requestAssistedAction: (
    sessionId: string,
    actionType: TicketChatAssistedActionType,
  ) => Promise<TicketChatMessage>;
  transfer: (sessionId: string, targetUserId: string) => Promise<TicketChatSession>;
  linkTicket?: (sessionId: string, data: LinkSupportChatToTicketRequest) => Promise<TicketChatSession>;
  end: (sessionId: string) => Promise<TicketChatSession>;
  prepareUpload: (
    sessionId: string,
    data: { fileName: string; contentType: string; sizeBytes: number },
  ) => Promise<PresignedChatUploadResponse>;
  completeUpload: (sessionId: string, data: CompleteChatUploadRequest) => Promise<TicketChatAttachment>;
  attachmentUrl: (sessionId: string, attachmentId: string) => string;
  setPresence: (sessionId: string, active: boolean, clientId: string) => Promise<unknown>;

  /** Janela dedicada a abrir ANTES do start (bloqueio de popup). Ausente = já estamos na janela. */
  openWindow?: (sessionId?: string | null) => Window;
  /** Motivo para não permitir iniciar a conversa (ex.: chamado sem máquina). */
  startBlockedReason?: string | null;
  startSuccessMessage: string;
  /** Texto exibido quando a conversa terminou e a thread continua em leitura. */
  endedNotice: string;
}

export function createTicketChatClient(params: {
  ticketId: string;
  agentId?: string | null;
  clientId?: string | null;
  siteId?: string | null;
}): SupportChatClient {
  const { ticketId, agentId, clientId, siteId } = params;

  return {
    key: "ticket:" + ticketId,
    realtimeScope: { clientId, siteId },
    matchesRealtimeEvent: (event, sessionId) => {
      const ids = ticketChatEventIds(event);
      if (!ids) return false;
      return (
        (!!ids.ticketId && ids.ticketId === ticketId) ||
        (!!sessionId && !!ids.sessionId && ids.sessionId === sessionId)
      );
    },

    getCurrent: () => ticketChatApi.getCurrent(ticketId),
    listMessages: (sessionId, afterSequence, limit, beforeSequence) =>
      ticketChatApi.listMessages(ticketId, sessionId, afterSequence, limit, beforeSequence),
    start: () => ticketChatApi.start(ticketId),
    retryInvite: (sessionId) => ticketChatApi.retryInvite(ticketId, sessionId),
    sendMessage: (sessionId, data) => ticketChatApi.sendMessage(ticketId, sessionId, data),
    sendTyping: (sessionId, isTyping) => ticketChatApi.sendTyping(ticketId, sessionId, isTyping),
    requestAssistedAction: (sessionId, actionType) =>
      ticketChatApi.requestAssistedAction(ticketId, sessionId, actionType),
    transfer: (sessionId, targetUserId) => ticketChatApi.transfer(ticketId, sessionId, targetUserId),
    end: (sessionId) => ticketChatApi.end(ticketId, sessionId),
    prepareUpload: (sessionId, data) => ticketChatApi.prepareUpload(ticketId, sessionId, data),
    completeUpload: (sessionId, data) => ticketChatApi.completeUpload(ticketId, sessionId, data),
    attachmentUrl: (_sessionId, attachmentId) => ticketChatApi.attachmentUrl(ticketId, attachmentId),
    setPresence: (_sessionId, active, clientIdValue) =>
      ticketChatApi.setPresence(ticketId, active, clientIdValue),

    openWindow: (sessionId) => openTicketChatWindow(ticketId, sessionId),
    startBlockedReason: agentId ? null : "O chamado não está vinculado a uma máquina.",
    startSuccessMessage: "Convite de chat enviado. A conversa está na janela do chat.",
    endedNotice:
      "Conversa encerrada. A janela continua aberta para leitura — o histórico fica no chamado.",
  };
}

export function createAgentSupportChatClient(params: {
  agentId: string;
  clientId?: string | null;
  siteId?: string | null;
}): SupportChatClient {
  const { agentId, clientId, siteId } = params;

  return {
    key: "agent:" + agentId,
    realtimeScope: { clientId, siteId },
    matchesRealtimeEvent: (event, sessionId) => {
      const ids = ticketChatEventIds(event);
      return !!sessionId && !!ids?.sessionId && ids.sessionId === sessionId;
    },

    getCurrent: () => supportChatApi.getCurrentForAgent(agentId),
    listMessages: (sessionId, afterSequence, limit, beforeSequence) =>
      supportChatApi.listMessages(sessionId, afterSequence, limit, beforeSequence),
    start: () => supportChatApi.startForAgent(agentId),
    retryInvite: (sessionId) => supportChatApi.retryInvite(sessionId),
    sendMessage: (sessionId, data) => supportChatApi.sendMessage(sessionId, data),
    sendTyping: (sessionId, isTyping) => supportChatApi.sendTyping(sessionId, isTyping),
    requestAssistedAction: (sessionId, actionType) =>
      supportChatApi.requestAssistedAction(sessionId, actionType),
    transfer: (sessionId, targetUserId) => supportChatApi.transfer(sessionId, targetUserId),
    linkTicket: (sessionId, data) => supportChatApi.linkTicket(sessionId, data),
    end: (sessionId) => supportChatApi.end(sessionId),
    prepareUpload: (sessionId, data) => supportChatApi.prepareUpload(sessionId, data),
    completeUpload: (sessionId, data) => supportChatApi.completeUpload(sessionId, data),
    attachmentUrl: (sessionId, attachmentId) => supportChatApi.attachmentUrl(sessionId, attachmentId),
    setPresence: (sessionId, active, clientIdValue) =>
      supportChatApi.setPresence(sessionId, active, clientIdValue),

    // A conversa avulsa já vive na própria janela dedicada: não há popup.
    startBlockedReason: null,
    startSuccessMessage: "Convite de chat enviado para a máquina.",
    endedNotice:
      "Conversa encerrada. A janela continua aberta para leitura — o histórico fica no servidor.",
  };
}
