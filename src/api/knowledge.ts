import { api } from "./client";
import type {
  ArticleListPage,
  ArticleVersion,
  CreateKnowledgeArticleRequest,
  KbLinkFeedbackRequest,
  KbSearchRequest,
  KbSuggestResult,
  KnowledgeArticle,
  KnowledgeListQuery,
  KnowledgeSearchQuery,
  KnowledgeTreeNode,
  LinkTicketKnowledgeRequest,
  PublishArticleRequest,
  TicketKnowledgeSuggestQuery,
  UpdateKnowledgeArticleRequest,
} from "./types";

const BASE = "/api/v1/knowledge";

export const knowledgeApi = {
  list: (params?: KnowledgeListQuery) =>
    api.get<KnowledgeArticle[]>(
      BASE,
      (params ?? {}) as unknown as Record<string, unknown>,
    ),

  listAllVisible: (params?: KnowledgeListQuery) =>
    api.get<ArticleListPage>(
      BASE,
      (params ?? {}) as unknown as Record<string, unknown>,
    ),

  tree: (params?: KnowledgeListQuery) =>
    api.get<KnowledgeTreeNode[]>(
      `${BASE}/tree`,
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

  publish: (id: string, data: PublishArticleRequest) =>
    api.post<KnowledgeArticle>(`${BASE}/${id}/publish`, data),

  unpublish: (id: string, lastEditedBy?: string) =>
    api.post<KnowledgeArticle>(
      `${BASE}/${id}/unpublish${lastEditedBy ? `?lastEditedBy=${encodeURIComponent(lastEditedBy)}` : ''}`,
    ),

  getVersions: (id: string) =>
    api.get<ArticleVersion[]>(`${BASE}/${id}/versions`),

  getVersion: (id: string, versionNumber: number) =>
    api.get<ArticleVersion>(`${BASE}/${id}/versions/${versionNumber}`),

  chatSearch: (data: KbSearchRequest) =>
    api.post<KbSuggestResult>(`${BASE}/chat-search`, data),

  listTicketKnowledge: (ticketId: string) =>
    api.get<KnowledgeArticle[]>(`/api/v1/tickets/${ticketId}/knowledge`),

  linkTicketKnowledge: (ticketId: string, data: LinkTicketKnowledgeRequest) =>
    api.post<void>(`/api/v1/tickets/${ticketId}/knowledge`, data),

  unlinkTicketKnowledge: (ticketId: string, articleId: string) =>
    api.del<void>(`/api/v1/tickets/${ticketId}/knowledge/${articleId}`),

  suggestTicketKnowledge: (
    ticketId: string,
    params?: TicketKnowledgeSuggestQuery,
  ) =>
    api.get<KnowledgeArticle[]>(
      `/api/v1/tickets/${ticketId}/knowledge/suggest`,
      (params ?? {}) as unknown as Record<string, unknown>,
    ),

  sendTicketKnowledgeFeedback: (
    ticketId: string,
    articleId: string,
    data: KbLinkFeedbackRequest,
  ) =>
    api.post<void>(
      `/api/v1/tickets/${ticketId}/knowledge/${articleId}/feedback`,
      data,
    ),
};
