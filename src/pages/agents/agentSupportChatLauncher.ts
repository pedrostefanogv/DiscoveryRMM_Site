import { PopupBlockedError } from "@/pages/tickets/ticketChatLauncher";

/**
 * Abre o chat de suporte da máquina em uma JANELA separada do navegador, no
 * mesmo padrão do chat do chamado, do acesso remoto e do remote debug.
 *
 * A janela é identificada pelo AGENT (e não por uma sessão): quem cuida de
 * abrir/retomar a conversa é a própria janela, o que permite "Iniciar nova
 * conversa" sem trocar de URL.
 */

const POPUP_FEATURES =
  "width=600,height=820,toolbar=no,menubar=no,scrollbars=no,resizable=yes,location=no,status=no";

export function agentSupportChatPopupUrl(agentId: string, autoStart = true): string {
  return "/agents/" + agentId + "/support-chat" + (autoStart ? "?start=1" : "");
}

/**
 * Abre (ou reutiliza) a janela do chat da máquina.
 *
 * Sempre chamado de forma SÍNCRONA no clique: bloqueadores de popup barram
 * window.open depois de um await.
 */
export function openAgentSupportChatWindow(agentId: string, autoStart = true): Window {
  const popup = window.open(
    agentSupportChatPopupUrl(agentId, autoStart),
    `agent-support-chat-${agentId}`,
    POPUP_FEATURES,
  );

  if (!popup) {
    throw new PopupBlockedError(
      "Popup bloqueada pelo navegador. Permita popups para manter o chat aberto fora da listagem.",
    );
  }

  popup.focus();
  return popup;
}
