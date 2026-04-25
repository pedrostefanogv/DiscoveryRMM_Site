import { api } from "./client";
import type {
  TicketAiSuggestedReplyResponse,
  TicketAiSummaryResponse,
  TicketAiTriageResponse,
} from "./types";

export const ticketAiApi = {
  triage: (ticketId: string) =>
    api.post<TicketAiTriageResponse>(`/api/tickets/${ticketId}/ai/triage`, {}),

  summarize: (ticketId: string) =>
    api.post<TicketAiSummaryResponse>(`/api/tickets/${ticketId}/ai/summarize`, {}),

  suggestReply: (ticketId: string) =>
    api.post<TicketAiSuggestedReplyResponse>(
      `/api/tickets/${ticketId}/ai/suggest-reply`,
      {},
    ),
};