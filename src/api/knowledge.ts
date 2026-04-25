import { api } from "./client";
import type {
  CreateKnowledgeArticleRequest,
  KnowledgeArticle,
  KnowledgeListQuery,
  KnowledgeSearchQuery,
  LinkTicketKnowledgeRequest,
  TicketKnowledgeSuggestQuery,
  UpdateKnowledgeArticleRequest,
} from "./types";

const BASE = "/api/knowledge";

export const knowledgeApi = {
  list: (params?: KnowledgeListQuery) =>
    api.get<KnowledgeArticle[]>(
      BASE,
      (params ?? {}) as unknown as Record<string, unknown>,
    ),

  search: (params: KnowledgeSearchQuery) =>
    api.get<KnowledgeArticle[]>(
      `${BASE}/search`,
      params as unknown as Record<string, unknown>,
    ),

  get: (id: string) => api.get<KnowledgeArticle>(`${BASE}/${id}`),

  create: (data: CreateKnowledgeArticleRequest) =>
    api.post<KnowledgeArticle>(BASE, data),

  update: (id: string, data: UpdateKnowledgeArticleRequest) =>
    api.put<KnowledgeArticle>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),

  publish: (id: string) => api.post<void>(`${BASE}/${id}/publish`),

  unpublish: (id: string) => api.post<void>(`${BASE}/${id}/unpublish`),

  listTicketKnowledge: (ticketId: string) =>
    api.get<KnowledgeArticle[]>(`/api/tickets/${ticketId}/knowledge`),

  linkTicketKnowledge: (ticketId: string, data: LinkTicketKnowledgeRequest) =>
    api.post<void>(`/api/tickets/${ticketId}/knowledge`, data),

  unlinkTicketKnowledge: (ticketId: string, articleId: string) =>
    api.del<void>(`/api/tickets/${ticketId}/knowledge/${articleId}`),

  suggestTicketKnowledge: (
    ticketId: string,
    params?: TicketKnowledgeSuggestQuery,
  ) =>
    api.get<KnowledgeArticle[]>(
      `/api/tickets/${ticketId}/knowledge/suggest`,
      (params ?? {}) as unknown as Record<string, unknown>,
    ),
};
