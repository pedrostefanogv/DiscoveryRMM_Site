import { useQuery } from "@tanstack/react-query";
import { ticketAnswersApi } from "@/api/ticket-answers";

export function useTicketAnswers(ticketId: string, enabled = true) {
  return useQuery({
    queryKey: ["ticket-answers", ticketId],
    queryFn: () => ticketAnswersApi.list(ticketId),
    enabled: enabled && !!ticketId,
  });
}
