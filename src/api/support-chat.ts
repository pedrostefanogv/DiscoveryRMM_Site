import { api } from "./client";
import type {
  CompleteChatUploadRequest,
  PresignedChatUploadResponse,
  SendTicketChatMessageRequest,
  TicketChatAttachment,
  TicketChatMessage,
  TicketChatSession,
  TicketChatState,
} from "./ticket-chat";

// ─────────────────────────────────────────────────────────────────────────────
// Chat de suporte AVULSO (sem chamado) — console web.
//
// Mesma sessão/mensagens/anexos do chat do chamado, mas identificada pela
// SESSÃO em vez do ticket. É o que permite abrir o chat direto da lista ou do
// detalhe do agent, sem depender de um chamado aberto.
// ─────────────────────────────────────────────────────────────────────────────

const AGENTS_BASE = "/api/v1/support-chat/agents";
const SESSIONS_BASE = "/api/v1/support-chat/sessions";

export const supportChatApi = {
  /** Sessão pendente/ativa da máquina (HasSession=false quando não há). */
  getCurrentForAgent: (agentId: string) =>
    api.get<TicketChatState>(AGENTS_BASE + "/" + agentId + "/sessions/current"),

  /** Abre a conversa com a máquina (ou devolve a sessão atual da máquina). */
  startForAgent: (agentId: string) =>
    api.post<TicketChatSession>(AGENTS_BASE + "/" + agentId + "/sessions"),

  listMessages: (sessionId: string, afterSequence = 0, limit = 200) =>
    api.get<TicketChatMessage[]>(
      SESSIONS_BASE + "/" + sessionId + "/messages?afterSequence=" + afterSequence + "&limit=" + limit,
    ),

  sendMessage: (sessionId: string, data: SendTicketChatMessageRequest) =>
    api.post<TicketChatMessage>(SESSIONS_BASE + "/" + sessionId + "/messages", data),

  end: (sessionId: string, reason = "support_closed") =>
    api.post<TicketChatSession>(SESSIONS_BASE + "/" + sessionId + "/end", { reason }),

  retryInvite: (sessionId: string) =>
    api.post<TicketChatSession>(SESSIONS_BASE + "/" + sessionId + "/invite/retry"),

  prepareUpload: (
    sessionId: string,
    data: { fileName: string; contentType: string; sizeBytes: number },
  ) =>
    api.post<PresignedChatUploadResponse>(
      SESSIONS_BASE + "/" + sessionId + "/attachments/presigned-upload",
      data,
    ),

  completeUpload: (sessionId: string, data: CompleteChatUploadRequest) =>
    api.post<TicketChatAttachment>(
      SESSIONS_BASE + "/" + sessionId + "/attachments/complete-upload",
      data,
    ),

  /** URL autenticada do anexo (o componente baixa como blob). */
  attachmentUrl: (sessionId: string, attachmentId: string) =>
    SESSIONS_BASE + "/" + sessionId + "/attachments/" + attachmentId,

  /** Presença: avisa que o atendente está com a janela desta conversa aberta. */
  setPresence: (sessionId: string, active: boolean, clientId: string) => {
    const url =
      SESSIONS_BASE + "/" + sessionId + "/presence?clientId=" + encodeURIComponent(clientId);

    return active ? api.post<void>(url) : api.del<void>(url);
  },
};
