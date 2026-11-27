import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ticketAiApi, ticketAssignmentApi } from "@/api";

export function useTicketAiTriage(ticketId?: string) {
  const qc = useQueryClient();
  const key = ["ticket-ai", "triage", ticketId ?? ""] as const;
  const cached = useQuery({
    queryKey: key,
    queryFn: () => null as Awaited<ReturnType<typeof ticketAiApi.triage>> | null,
    enabled: false,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (id: string) => ticketAiApi.triage(id),
    onSuccess: (data, id) => {
      qc.setQueryData(["ticket-ai", "triage", id], data);
    },
  });
  return {
    ...mutation,
    data: mutation.data ?? cached.data ?? undefined,
  };
}

export function useTicketAiSummary(ticketId?: string) {
  const qc = useQueryClient();
  const key = ["ticket-ai", "summary", ticketId ?? ""] as const;
  const cached = useQuery({
    queryKey: key,
    queryFn: () => null as Awaited<ReturnType<typeof ticketAiApi.summarize>> | null,
    enabled: false,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (id: string) => ticketAiApi.summarize(id),
    onSuccess: (data, id) => {
      qc.setQueryData(["ticket-ai", "summary", id], data);
    },
  });
  return {
    ...mutation,
    data: mutation.data ?? cached.data ?? undefined,
  };
}

export function useTicketAiSuggestReply(ticketId?: string) {
  const qc = useQueryClient();
  const key = ["ticket-ai", "suggest-reply", ticketId ?? ""] as const;
  const cached = useQuery({
    queryKey: key,
    queryFn: () => null as Awaited<ReturnType<typeof ticketAiApi.suggestReply>> | null,
    enabled: false,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (id: string) => ticketAiApi.suggestReply(id),
    onSuccess: (data, id) => {
      qc.setQueryData(["ticket-ai", "suggest-reply", id], data);
    },
  });
  return {
    ...mutation,
    data: mutation.data ?? cached.data ?? undefined,
  };
}

export function useTicketAiDraftKb(ticketId?: string) {
  const qc = useQueryClient();
  const key = ["ticket-ai", "draft-kb", ticketId ?? ""] as const;
  const cached = useQuery({
    queryKey: key,
    queryFn: () => null as Awaited<ReturnType<typeof ticketAiApi.draftKbArticle>> | null,
    enabled: false,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: ({ id, persist = false }: { id: string; persist?: boolean }) =>
      ticketAiApi.draftKbArticle(id, persist),
    onSuccess: (data, vars) => {
      qc.setQueryData(["ticket-ai", "draft-kb", vars.id], data);
    },
  });
  return {
    ...mutation,
    data: mutation.data ?? cached.data ?? undefined,
  };
}

const assignmentKey = (ticketId: string) =>
  ["ticket-assignment", "decision", ticketId] as const;

/**
 * Última decisão da triagem por IA para o chamado. Um 404 apenas significa que
 * ainda não houve decisão (por isso retry desativado e erro tratado na UI).
 */
export function useTicketAssignmentDecision(ticketId: string, enabled = true) {
  return useQuery({
    queryKey: assignmentKey(ticketId),
    queryFn: () => ticketAssignmentApi.getDecision(ticketId),
    enabled: !!ticketId && enabled,
    retry: false,
    staleTime: 30_000,
  });
}

/** Roda a triagem por IA e devolve a sugestão (sem atribuir). */
export function usePreviewTicketAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => ticketAssignmentApi.preview(ticketId),
    onSuccess: (_result, ticketId) => {
      void qc.invalidateQueries({ queryKey: assignmentKey(ticketId) });
    },
  });
}

/** Roda a triagem por IA e aplica o responsável escolhido. */
export function useApplyTicketAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => ticketAssignmentApi.apply(ticketId),
    onSuccess: (_result, ticketId) => {
      void qc.invalidateQueries({ queryKey: assignmentKey(ticketId) });
      void qc.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
