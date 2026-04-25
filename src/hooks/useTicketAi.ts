import { useMutation } from "@tanstack/react-query";
import { ticketAiApi } from "@/api";

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