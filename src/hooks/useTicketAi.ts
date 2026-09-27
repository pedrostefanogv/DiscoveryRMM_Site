import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ticketAiApi, ticketAssignmentApi } from "@/api";

export function useTicketAiTriage() {
  return useMutation({
    mutationFn: (ticketId: string) => ticketAiApi.triage(ticketId),
  });
}

export function useTicketAiSummary() {
  return useMutation({
    mutationFn: (ticketId: string) => ticketAiApi.summarize(ticketId),
  });
}

export function useTicketAiSuggestReply() {
  return useMutation({
    mutationFn: (ticketId: string) => ticketAiApi.suggestReply(ticketId),
  });
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
