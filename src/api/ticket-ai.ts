import { api } from "./client";
import type {
  TicketAiSuggestedReplyResponse,
  TicketAiSummaryResponse,
  TicketAiTriageResponse,
} from "./types";

export const ticketAiApi = {
  triage: (ticketId: string) =>
    api.post<TicketAiTriageResponse>(`/api/v1/tickets/${ticketId}/ai/triage`, {}),

  summarize: (ticketId: string) =>
    api.post<TicketAiSummaryResponse>(`/api/v1/tickets/${ticketId}/ai/summarize`, {}),

  suggestReply: (ticketId: string) =>
    api.post<TicketAiSuggestedReplyResponse>(
      `/api/v1/tickets/${ticketId}/ai/suggest-reply`,
      {},
    ),

  draftKbArticle: (ticketId: string) =>
    api.post<unknown>(
      `/api/v1/tickets/${ticketId}/ai/draft-kb-article`,
      {},
    ),
};