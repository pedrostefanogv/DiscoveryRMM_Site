import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getNatsService, type DashboardEvent } from "@/api/nats";
import type {
  LinkSupportChatToTicketRequest,
  SendTicketChatMessageRequest,
  TicketChatAssistedActionType,
  TicketChatMessage,
} from "@/api/ticket-chat";
import { realtimeConfig } from "@/config/realtime";
import { buildDashboardNatsSubjects, type DashboardNatsScope } from "@/utils/natsSubjects";
import type { SupportChatClient } from "./supportChatClient";
import { ticketChatEventIds, TICKET_CHAT_QUERY_ROOT } from "./useTicketChatRealtime";
import { TICKET_CHAT_PRESENCE_HEARTBEAT_MS } from "./useTicketChatPresence";
import { ticketTimelineQueryKey } from "./useTickets";

// ─────────────────────────────────────────────────────────────────────────────
// Hooks do chat de suporte genéricos sobre SupportChatClient.
//
// SEM POLLING: a atualização vem do sinal NATS (TicketChatActivity), que
// invalida as queries; o conteúdo é buscado por REST. O intervalo de refetch é
// apenas rede de segurança quando o realtime está fora.
// ─────────────────────────────────────────────────────────────────────────────

const NATS_ENABLED = realtimeConfig.useNats && realtimeConfig.natsEnabled;

const KEYS = {
  state: (key: string) => [...TICKET_CHAT_QUERY_ROOT, "state", key] as const,
  messages: (key: string, sessionId: string) =>
    [...TICKET_CHAT_QUERY_ROOT, "messages", key, sessionId] as const,
};

function refreshChat(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: TICKET_CHAT_QUERY_ROOT });
}

export function useSupportChatCurrent(
  client: SupportChatClient,
  enabled = true,
  refetchInterval: number | false = false,
) {
  return useQuery({
    queryKey: KEYS.state(client.key),
    queryFn: () => client.getCurrent(),
    enabled,
    staleTime: 5_000,
    refetchInterval,
  });
}

function mergeChatMessages(
  existing: TicketChatMessage[],
  incoming: TicketChatMessage[],
): TicketChatMessage[] {
  if (incoming.length === 0) return existing;

  const byId = new Map<string, TicketChatMessage>();
  const seenClientIds = new Set<string>();

  for (const msg of incoming) {
    if (msg.clientMessageId) seenClientIds.add(msg.clientMessageId);
  }

  for (const msg of existing) {
    // Remove bolha otimista quando a versão canônica chegou pelo mesmo clientMessageId.
    if (
      msg.sequenceNumber === Number.MAX_SAFE_INTEGER &&
      msg.clientMessageId &&
      seenClientIds.has(msg.clientMessageId)
    ) {
      continue;
    }
    byId.set(msg.id, msg);
  }

  for (const msg of incoming) {
    byId.set(msg.id, msg);
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.sequenceNumber !== b.sequenceNumber) {
      return a.sequenceNumber - b.sequenceNumber;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export function useSupportChatMessages(
  client: SupportChatClient,
  sessionId: string | undefined,
  enabled = true,
  refetchInterval: number | false = false,
) {
  const queryClient = useQueryClient();
  const key = KEYS.messages(client.key, sessionId ?? "");

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const cached = queryClient.getQueryData<TicketChatMessage[]>(key) ?? [];
      const canonical = cached.filter((m) => m.sequenceNumber < Number.MAX_SAFE_INTEGER);
      const maxSeq = canonical.reduce((max, m) => Math.max(max, m.sequenceNumber), 0);

      if (maxSeq > 0) {
        const delta = await client.listMessages(sessionId!, maxSeq, 200);
        return mergeChatMessages(cached, delta);
      }

      const initial = await client.listMessages(sessionId!, 0, 200);
      return mergeChatMessages(cached, initial);
    },
    enabled: !!sessionId && enabled,
    staleTime: 2_000,
    refetchInterval,
  });
}

export function useLoadOlderSupportChatMessages(
  client: SupportChatClient,
  sessionId: string | undefined,
) {
  const queryClient = useQueryClient();
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  useEffect(() => {
    setHasMoreOlder(true);
  }, [client.key, sessionId]);

  const loadOlder = useCallback(async () => {
    if (!sessionId || isLoadingOlder || !hasMoreOlder) return;
    const key = KEYS.messages(client.key, sessionId);
    const cached = queryClient.getQueryData<TicketChatMessage[]>(key) ?? [];
    const canonical = cached.filter((m) => m.sequenceNumber < Number.MAX_SAFE_INTEGER);
    if (canonical.length === 0) return;

    const minSeq = canonical.reduce((min, m) => Math.min(min, m.sequenceNumber), Number.MAX_SAFE_INTEGER);
    if (minSeq <= 1 || minSeq === Number.MAX_SAFE_INTEGER) {
      setHasMoreOlder(false);
      return;
    }

    setIsLoadingOlder(true);
    try {
      const older = await client.listMessages(sessionId, 0, 200, minSeq);
      if (older.length < 200) {
        setHasMoreOlder(false);
      }
      if (older.length > 0) {
        queryClient.setQueryData<TicketChatMessage[]>(key, (prev) =>
          mergeChatMessages(prev ?? [], older),
        );
      }
    } finally {
      setIsLoadingOlder(false);
    }
  }, [client, hasMoreOlder, isLoadingOlder, queryClient, sessionId]);

  return { loadOlder, isLoadingOlder, hasMoreOlder };
}

export function useStartSupportChat(client: SupportChatClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.start(),
    onSuccess: () => refreshChat(queryClient),
  });
}

export function useRetrySupportChatInvite(client: SupportChatClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => client.retryInvite(sessionId),
    onSuccess: () => refreshChat(queryClient),
  });
}

export function useSendSupportChatMessage(
  client: SupportChatClient,
  sessionId: string | undefined,
) {
  const queryClient = useQueryClient();
  const key = KEYS.messages(client.key, sessionId ?? "");

  return useMutation({
    mutationFn: (data: SendTicketChatMessageRequest) => client.sendMessage(sessionId!, data),

    // Envio otimista: a mensagem aparece na hora e é substituída pelo snapshot
    // canônico (invalidação) quando o servidor confirmar. Em erro, reverte.
    onMutate: async (data: SendTicketChatMessageRequest) => {
      if (!sessionId) return undefined;

      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TicketChatMessage[]>(key) ?? [];

      const optimistic: TicketChatMessage = {
        id: "optimistic-" + (data.clientMessageId || Date.now()),
        sequenceNumber: Number.MAX_SAFE_INTEGER,
        clientMessageId: data.clientMessageId ?? undefined,
        authorKind: "Support",
        authorUserId: null,
        authorName: null,
        body: data.body,
        createdAt: new Date().toISOString(),
        attachments: [],
      };

      queryClient.setQueryData<TicketChatMessage[]>(key, [...previous, optimistic]);
      return { previous };
    },

    onSuccess: (saved) => {
      if (!sessionId || !saved) return;
      queryClient.setQueryData<TicketChatMessage[]>(key, (prev) =>
        mergeChatMessages(prev ?? [], [saved]),
      );
    },

    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => refreshChat(queryClient),
  });
}

export function useEndSupportChat(client: SupportChatClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => client.end(sessionId),
    onSuccess: () => refreshChat(queryClient),
  });
}

export function useTransferSupportChat(client: SupportChatClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, targetUserId }: { sessionId: string; targetUserId: string }) =>
      client.transfer(sessionId, targetUserId),
    onSuccess: () => refreshChat(queryClient),
  });
}

export function useLinkSupportChatToTicket(client: SupportChatClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data: LinkSupportChatToTicketRequest }) => {
      if (!client.linkTicket) {
        return Promise.reject(new Error("Conversa já vinculada a chamado."));
      }
      return client.linkTicket(sessionId, data);
    },
    onSuccess: () => refreshChat(queryClient),
  });
}

export function useRequestAssistedAction(client: SupportChatClient) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, actionType }: { sessionId: string; actionType: TicketChatAssistedActionType }) =>
      client.requestAssistedAction(sessionId, actionType),
    onSuccess: () => refreshChat(queryClient),
  });
}

/**
 * Invalida as queries do chat quando ESTA conversa recebe atividade.
 *
 * O sinal de dashboard não carrega o agentId: a conversa avulsa se identifica
 * pelo sessionId e a vinculada a chamado pelo ticketId (o cliente decide).
 */
export function useSupportChatRealtime(
  client: SupportChatClient,
  sessionId: string | undefined,
  enabled = true,
  onTyping?: (payload: { authorName?: string; isTyping: boolean }) => void,
) {
  const queryClient = useQueryClient();
  const scope = client.realtimeScope;
  const scopeKey = (scope.clientId ?? "") + "|" + (scope.siteId ?? "");

  const stableScope = useMemo<SupportChatClient["realtimeScope"]>(
    () => ({ clientId: scope.clientId, siteId: scope.siteId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey],
  );

  useEffect(() => {
    if (!enabled) return;
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

      const record = event as Record<string, unknown> | null;
      if (record && record.eventType === "TicketChatTyping") {
        const data = (record.data as Record<string, unknown> | undefined) ?? record;
        const eventSessionId = typeof data.sessionId === "string" ? data.sessionId : undefined;
        if (sessionId && eventSessionId === sessionId && onTyping) {
          onTyping({
            authorName: typeof data.authorName === "string" ? data.authorName : undefined,
            isTyping: Boolean(data.isTyping),
          });
        }
        return;
      }

      if (!client.matchesRealtimeEvent(event, sessionId)) return;

      void queryClient.invalidateQueries({ queryKey: TICKET_CHAT_QUERY_ROOT });

      const ticketId = ticketChatEventIds(event)?.ticketId;
      if (ticketId) {
        void queryClient.invalidateQueries({ queryKey: ticketTimelineQueryKey(ticketId) });
      }
    };

    void (async () => {
      let connected = false;
      try {
        connected = await natsService.connect();
      } catch (error) {
        console.debug("[NATS][support-chat] Falha ao conectar para tempo real:", error);
        return;
      }
      if (disposed || !connected) return;

      for (const subject of subjects) {
        if (!natsService.canSubscribeToSubject(subject)) {
          console.debug("[NATS][support-chat] Subject fora da allow-list do token, ignorando:", subject);
          continue;
        }
        void natsService.subscribe(subject, onEvent, { connectIfNeeded: false });
      }
    })();

    return () => {
      disposed = true;
      subjects.forEach((subject) => natsService.unsubscribe(subject, onEvent));
    };
  }, [client, sessionId, enabled, queryClient, stableScope, onTyping]);
}

/** O atendente está com a janela da conversa aberta e visível na tela? */
function isActivelyViewing(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}

/** Identificador de UMA execução do efeito (uma "janela" lógica). */
function createClientId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/**
 * Avisa o servidor que o atendente está com a janela DESTA conversa aberta e em
 * foco — o servidor então NÃO cria notificação de mensagem que ele já está
 * lendo. Best-effort: sem servidor, o comportamento é o de antes (notificar).
 */
export function useSupportChatPresence(
  client: SupportChatClient,
  sessionId: string | undefined,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !sessionId) return;

    const clientId = createClientId();
    let heartbeat: number | null = null;

    const send = (active: boolean) => {
      void client.setPresence(sessionId, active, clientId).catch(() => {
        // Presença é otimização: sem servidor a notificação continua sendo criada.
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
    window.addEventListener("pageshow", sync);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("pagehide", handlePageHide);
      stopHeartbeat();
      send(false);
    };
  }, [client, enabled, sessionId]);
}
