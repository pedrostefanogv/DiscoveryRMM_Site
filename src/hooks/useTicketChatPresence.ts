import { useEffect } from "react";
import { ticketChatApi } from "@/api/ticket-chat";

/** Frequencia do heartbeat de presenca (o servidor expira em ~75s). */
export const TICKET_CHAT_PRESENCE_HEARTBEAT_MS = 30_000;

/**
 * O atendente esta OLHANDO a conversa agora?
 *
 * Exige aba visivel E janela em foco: com o chat aberto atras de outro
 * aplicativo o atendente nao esta lendo a mensagem, entao o aviso deve voltar.
 */
function isActivelyViewing(): boolean {
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "visible") return false;
  return typeof document.hasFocus !== "function" || document.hasFocus();
}

/**
 * Identificador de UMA execucao do efeito (uma "janela" logica).
 *
 * Nao usa `crypto.randomUUID`: o console pode ser servido por http em rede
 * local (contexto nao seguro), onde a API nao existe.
 */
function createClientId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/**
 * Avisa o servidor que o atendente esta com a janela DESTA conversa aberta e
 * em foco. O servidor usa isso para NAO notificar (sino + Web Push) mensagens
 * que o atendente ja esta lendo na hora.
 *
 * - heartbeat enquanto a janela esta visivel e em foco;
 * - ocultar a aba, tirar o foco, fechar (pagehide) ou desmontar limpa a
 *   presenca na hora, e o aviso volta a ser criado normalmente;
 * - cada execucao do efeito tem um `clientId` proprio, para que o clear de uma
 *   montagem antiga (StrictMode) nao derrube a presenca valida;
 * - best-effort: se a chamada falhar, o comportamento e o de antes (notificar).
 */
export function useTicketChatPresence(ticketId: string | undefined, enabled = true): void {
  useEffect(() => {
    if (!enabled || !ticketId) return;

    const clientId = createClientId();
    let heartbeat: number | null = null;

    const send = (active: boolean) => {
      void ticketChatApi.setPresence(ticketId, active, clientId).catch(() => {
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

    const sync = () => {
      if (isActivelyViewing()) {
        send(true);
        startHeartbeat();
        return;
      }

      send(false);
      stopHeartbeat();
    };

    const handlePageHide = () => send(false);

    sync();

    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("pagehide", handlePageHide);
      stopHeartbeat();
      send(false);
    };
  }, [enabled, ticketId]);
}