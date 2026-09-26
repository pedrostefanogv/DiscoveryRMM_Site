import { useQuery } from "@tanstack/react-query";
import { ticketAnswersApi } from "@/api/ticket-answers";

/**
 * Busca por resposta do questionário (semântica com fallback por texto).
 * Só dispara com pelo menos 3 caracteres para não consultar a cada tecla.
 */
export function useTicketAnswerSearch(
  params: {
    q: string;
    limit?: number;
    templateId?: string;
    questionKey?: string;
  },
  enabled = true,
) {
  const q = params.q.trim();
  return useQuery({
    queryKey: [
      "ticket-answer-search",
      q,
      params.limit ?? 8,
      params.templateId ?? "",
      params.questionKey ?? "",
    ],
    queryFn: () => ticketAnswersApi.search({ ...params, q }),
    enabled: enabled && q.length >= 3,
    staleTime: 30_000,
  });
}
