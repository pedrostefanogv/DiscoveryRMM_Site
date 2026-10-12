import { useEffect } from "react";
import { ticketChatApi } from "@/api/ticket-chat";

/** Frequencia do heartbeat de presenca (o servidor expira em ~75s). */
export const TICKET_CHAT_PRESENCE_HEARTBEAT_MS = 30_000;

function isPageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/**
 * Avisa o servidor que o atendente esta com a janela DESTA conversa aberta e
 * visivel. O servidor usa isso para NAO notificar (sino + Web Push) mensagens
 * que o atendente ja esta lendo na hora.
 *
 * - heartbeat enquanto a pagina esta visivel (o servidor expira sozinho);
 * - ao ocultar a aba, fechar a janela (pagehide) ou desmontar a tela, limpa a
 *   presenca na hora, e o aviso volta a ser criado normalmente;
 * - best-effort: se a chamada falhar, o comportamento e o de antes (notificar).
 */
export function useTicketChatPresence(ticketId: string | undefined, enabled = true): void {
  useEffect(() => {
    if (!enabled || !ticketId) return;

    let heartbeat: number | null = null;

    const send = (active: boolean) => {
      void ticketChatApi.setPresence(ticketId, active).catch(() => {
        // Presenca e otimizacao: sem servidor a notificacao continua sendo criada.
      });
    };

    const stopHeartbeat = () => {
      if (heartbeat !== null) {
        window.clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeat = window.setInterval(() => send(true), TICKET_CHAT_PRESENCE_HEARTBEAT_MS);
    };

    const handleVisibilityChange = () => {
      if (isPageVisible()) {
        send(true);
        startHeartbeat();
        return;
      }

      send(false);
      stopHeartbeat();
    };

    const handlePageHide = () => send(false);

    if (isPageVisible()) {
      send(true);
      startHeartbeat();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      stopHeartbeat();
      send(false);
    };
  }, [enabled, ticketId]);
}