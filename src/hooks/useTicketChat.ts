import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ticketChatApi,
  type CompleteChatUploadRequest,
  type SendTicketChatMessageRequest,
  type TicketChatMessage,
} from "@/api/ticket-chat";
import { TICKET_CHAT_QUERY_ROOT } from "./useTicketChatRealtime";

// ─────────────────────────────────────────────────────────────────────────────
// Chat de suporte vinculado ao chamado.
//
// SEM POLLING: a atualização vem do sinal NATS (`TicketChatActivity`), que
// invalida estas queries; o fetch do delta é REST. As queries têm apenas o
// refresh padrão do React Query (mount/foco) como rede de segurança.
// ─────────────────────────────────────────────────────────────────────────────

const KEYS = {
  all: TICKET_CHAT_QUERY_ROOT,
  state: (ticketId: string) => [...TICKET_CHAT_QUERY_ROOT, "state", ticketId] as const,
  messages: (ticketId: string, sessionId: string) =>
    [...TICKET_CHAT_QUERY_ROOT, "messages", ticketId, sessionId] as const,
  history: (ticketId: string) => [...TICKET_CHAT_QUERY_ROOT, "history", ticketId] as const,
};

function refreshChat(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: TICKET_CHAT_QUERY_ROOT });
}

/** Sessão pendente/ativa do chamado. */
export function useCurrentTicketChat(ticketId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: KEYS.state(ticketId ?? ""),
    queryFn: () => ticketChatApi.getCurrent(ticketId!),
    enabled: !!ticketId && enabled,
    staleTime: 5_000,
  });
}

/** Mensagens da sessão (snapshot do histórico ativo). */
export function useTicketChatMessages(
  ticketId: string | undefined,
  sessionId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.messages(ticketId ?? "", sessionId ?? ""),
    queryFn: () => ticketChatApi.listMessages(ticketId!, sessionId!, 0, 300),
    enabled: !!ticketId && !!sessionId && enabled,
    staleTime: 2_000,
  });
}

/** Conversas anteriores do chamado (somente leitura). */
export function useTicketChatHistory(ticketId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: KEYS.history(ticketId ?? ""),
    queryFn: () => ticketChatApi.history(ticketId!),
    enabled: !!ticketId && enabled,
    staleTime: 30_000,
  });
}

export function useStartTicketChat(ticketId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ticketChatApi.start(ticketId!),
    onSuccess: () => refreshChat(queryClient),
  });
}

export function useRetryTicketChatInvite(ticketId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => ticketChatApi.retryInvite(ticketId!, sessionId),
    onSuccess: () => refreshChat(queryClient),
  });
}

export function useSendTicketChatMessage(ticketId: string | undefined, sessionId: string | undefined) {
  const queryClient = useQueryClient();
  const key = KEYS.messages(ticketId ?? "", sessionId ?? "");

  return useMutation({
    mutationFn: (data: SendTicketChatMessageRequest) =>
      ticketChatApi.sendMessage(ticketId!, sessionId!, data),

    // Envio otimista: a mensagem aparece na hora e é substituída pelo snapshot
    // canônico (invalidação) quando o servidor confirmar. Em erro, reverte.
    onMutate: async (data: SendTicketChatMessageRequest) => {
      if (!ticketId || !sessionId) return undefined;

      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TicketChatMessage[]>(key) ?? [];

      const optimistic: TicketChatMessage = {
        id: "optimistic-" + Date.now(),
        sequenceNumber: Number.MAX_SAFE_INTEGER,
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

    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(key, context.previous);
    },

    onSettled: () => refreshChat(queryClient),
  });
}

export function useEndTicketChat(ticketId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => ticketChatApi.end(ticketId!, sessionId),
    onSuccess: () => refreshChat(queryClient),
  });
}

export function usePrepareTicketChatUpload(ticketId: string | undefined, sessionId: string | undefined) {
  return useMutation({
    mutationFn: (data: { fileName: string; contentType: string; sizeBytes: number }) =>
      ticketChatApi.prepareUpload(ticketId!, sessionId!, data),
  });
}

export function useCompleteTicketChatUpload(ticketId: string | undefined, sessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CompleteChatUploadRequest) =>
      ticketChatApi.completeUpload(ticketId!, sessionId!, data),
    onSuccess: () => refreshChat(queryClient),
  });
}
