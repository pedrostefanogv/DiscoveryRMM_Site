import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import { realtimeConfig } from "@/config/realtime";
import { buildDashboardNatsSubjects, type DashboardNatsScope } from "@/utils/natsSubjects";
import { ticketTimelineQueryKey } from "./useTickets";

const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;

/** Raiz das queries do chat de suporte. */
export const TICKET_CHAT_QUERY_ROOT = ["ticketChat"] as const;

/** eventType canônico publicado pelo servidor (SINAL sem corpo). */
export const TICKET_CHAT_EVENT_TYPE = "TicketChatActivity";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * O servidor publica `TicketChatActivity` no canal de dashboard a cada mensagem e
 * a cada mudança de estado da sessão, SEM o corpo da mensagem. O console usa o
 * sinal apenas para invalidar as queries do chat — o conteúdo é buscado por REST
 * autenticado e escopado pelo chamado.
 */
/** Ids publicados no sinal de atividade do chat (ticket e/ou sessão). */
export function ticketChatEventIds(
  event: DashboardEvent | Record<string, unknown> | null | undefined,
): { ticketId?: string; sessionId?: string } | null {
  const record = asRecord(event);
  if (!record) return null;

  const eventType = typeof record.eventType === "string" ? record.eventType : "";
  if (eventType !== TICKET_CHAT_EVENT_TYPE) return null;

  const data = asRecord(record.data) ?? record;
  const ticketId = typeof data.ticketId === "string" ? data.ticketId : undefined;
  const sessionId = typeof data.sessionId === "string" ? data.sessionId : undefined;

  return { ticketId, sessionId };
}

export function isTicketChatEventForTicket(
  event: DashboardEvent | Record<string, unknown> | null | undefined,
  ticketId: string,
): boolean {
  const ids = ticketChatEventIds(event);
  return !!ids?.ticketId && ids.ticketId === ticketId;
}

/**
 * Sinal de atividade de uma SESSÃO específica.
 *
 * Usado pela conversa avulsa (sem chamado), que se identifica pelo id da sessão
 * — o sinal de dashboard não carrega o agentId.
 */
export function isTicketChatEventForSession(
  event: DashboardEvent | Record<string, unknown> | null | undefined,
  sessionId: string,
): boolean {
  const ids = ticketChatEventIds(event);
  return !!ids?.sessionId && ids.sessionId === sessionId;
}

export interface TicketChatRealtimeScope {
  clientId?: string | null;
  siteId?: string | null;
}

/**
 * Invalida as queries do chat quando o chamado recebe atividade.
 *
 * Sem polling: a UI é atualizada pelo sinal do NATS; se o NATS estiver
 * indisponível, o chat continua funcional (envio por REST) e o usuário pode
 * recarregar — o banner de realtime do header já sinaliza o problema.
 */
export function useTicketChatRealtime(
  ticketId: string | undefined,
  scope: TicketChatRealtimeScope,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const scopeKey = (scope.clientId ?? "") + "|" + (scope.siteId ?? "") + "|" + (ticketId ?? "");

  const stableScope = useMemo<TicketChatRealtimeScope>(
    () => ({ clientId: scope.clientId, siteId: scope.siteId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  );

  useEffect(() => {
    if (!enabled || !ticketId) return;
    if (!NATS_ENABLED || !realtimeConfig.natsUrl) return;

    let disposed = false;

    const natsScope: DashboardNatsScope = stableScope.siteId && stableScope.clientId
      ? { level: "site", clientId: stableScope.clientId, siteId: stableScope.siteId }
      : stableScope.clientId
        ? { level: "client", clientId: stableScope.clientId }
        : { level: "global" };

    const subjects = buildDashboardNatsSubjects(natsScope, {
      includeScopedFallbacks: true,
      includeSiteWildcardForClientScope: true,
      includeGlobalWildcardSubjects: true,
    });

    const natsService = getNatsService({
      url: realtimeConfig.natsUrl,
      enabled: NATS_ENABLED,
      authMode: realtimeConfig.natsAuthMode,
      clientId: stableScope.clientId ?? undefined,
      siteId: stableScope.siteId ?? undefined,
      scopeMode: "preserve",
    });

    const onEvent = (event: DashboardEvent | Record<string, unknown>) => {
      if (disposed) return;
      if (!isTicketChatEventForTicket(event, ticketId)) return;

      // Estado/lista do chat...
      void queryClient.invalidateQueries({ queryKey: TICKET_CHAT_QUERY_ROOT });

      // ...e a linha do tempo: cada chat iniciado/encerrado grava um evento lá,
      // então o operador acompanha a movimentação sem recarregar a página.
      void queryClient.invalidateQueries({ queryKey: ticketTimelineQueryKey(ticketId) });
    };

    void (async () => {
      let connected = false;
      try {
        connected = await natsService.connect();
      } catch (error) {
        console.debug("[NATS][ticket-chat] Falha ao conectar para tempo real:", error);
        return;
      }
      if (disposed || !connected) return;

      for (const subject of subjects) {
        if (!natsService.canSubscribeToSubject(subject)) {
          console.debug("[NATS][ticket-chat] Subject fora da allow-list do token, ignorando:", subject);
          continue;
        }
        void natsService.subscribe(subject, onEvent, { connectIfNeeded: false });
      }
    })();

    return () => {
      disposed = true;
      subjects.forEach((subject) => natsService.unsubscribe(subject, onEvent));
    };
  }, [ticketId, enabled, queryClient, stableScope]);
}
