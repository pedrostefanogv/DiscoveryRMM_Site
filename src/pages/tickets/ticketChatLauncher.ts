/**
 * Abre o chat do chamado em uma JANELA separada do navegador, no mesmo padrão
 * do acesso remoto e do console de remote debug.
 *
 * Motivo: a conversa não pode morrer quando o atendente sai do chamado —
 * consultar outra informação, outra aba do console ou fechar o detalhe do
 * chamado não interrompe o chat.
 */
export class PopupBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PopupBlockedError";
  }
}

const POPUP_FEATURES =
  "width=600,height=820,toolbar=no,menubar=no,scrollbars=no,resizable=yes,location=no,status=no";

export function ticketChatPopupUrl(ticketId: string, sessionId?: string | null): string {
  const query = new URLSearchParams();
  if (sessionId) query.set("sessionId", sessionId);
  const suffix = query.toString();
  return `/tickets/${ticketId}/chat${suffix ? "?" + suffix : ""}`;
}

/**
 * Abre (ou reutiliza) a janela do chat.
 *
 * Sempre chamado de forma SÍNCRONA no clique: bloqueadores de popup barram
 * window.open depois de um await.
 */
export function openTicketChatWindow(ticketId: string, sessionId?: string | null): Window {
  const popup = window.open(
    ticketChatPopupUrl(ticketId, sessionId),
    `ticket-chat-${ticketId}`,
    POPUP_FEATURES,
  );

  if (!popup) {
    throw new PopupBlockedError(
      "Popup bloqueada pelo navegador. Permita popups para manter o chat aberto fora do chamado.",
    );
  }

  popup.focus();
  return popup;
}
