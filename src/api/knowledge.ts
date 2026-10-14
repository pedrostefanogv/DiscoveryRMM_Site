import { ApiError, api, apiFetchResponse, parseErrorMessage } from "./client";
import type {
  ArticleListPage,
  ArticlePage,
  ArticlePageTreeNode,
  ArticleVersion,
  CreateArticlePageRequest,
  CreateKnowledgeArticleRequest,
  KbLinkFeedbackRequest,
  KbSearchRequest,
  KbSuggestResult,
  KnowledgeArticle,
  KnowledgeListQuery,
  KnowledgeSearchQuery,
  KbImage,
  KbImageCompleteUploadRequest,
  KbImageListItem,
  KbImageUploadRequest,
  KbImageUrlResponse,
  LinkTicketKnowledgeRequest,
  PresignedUploadResponse,
  PublishArticleRequest,
  TicketKnowledgeLinkResponse,
  TicketKnowledgeSuggestQuery,
  UpdateArticlePageRequest,
  UpdateKnowledgeArticleRequest,
} from "./types";

const BASE = "/api/v1/knowledge";

/** Base das imagens privadas de um artigo. */
function imagesBase(articleId: string): string {
  return `${BASE}/${articleId}/images`;
}

/**
 * Baixa o binário da imagem pela API autenticada (Bearer, same-origin).
 * Fallback de leitura quando a URL pré-assinada não é utilizável.
 */
async function downloadImageBlob(
  articleId: string,
  attachmentId: string,
): Promise<Blob> {
  const response = await apiFetchResponse(
    `${imagesBase(articleId)}/${attachmentId}`,
    { method: "GET" },
  );

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new ApiError(response.status, message);
  }

  return response.blob();
}

export const knowledgeApi = {
  // GET /knowledge sempre devolve ArticleListPage (listagem unificada,
  // cursor-based, ordenável via sortBy/sortDirection).
  listAllVisible: (params?: KnowledgeListQuery) =>
    api.get<ArticleListPage>(
      BASE,
      (params ?? {}) as unknown as Record<string, unknown>,
    ),

  // ── Sub-páginas internas do artigo ────────────────────────────
  getPages: (articleId: string) =>
    api.get<ArticlePageTreeNode[]>(`${BASE}/${articleId}/pages`),

  getPage: (articleId: string, pageId: string) =>
    api.get<ArticlePage>(`${BASE}/${articleId}/pages/${pageId}`),

  createPage: (articleId: string, data: CreateArticlePageRequest) =>
    api.post<ArticlePage>(`${BASE}/${articleId}/pages`, data),

  updatePage: (articleId: string, pageId: string, data: UpdateArticlePageRequest) =>
    api.put<ArticlePage>(`${BASE}/${articleId}/pages/${pageId}`, data),

  deletePage: (articleId: string, pageId: string) =>
    api.del<void>(`${BASE}/${articleId}/pages/${pageId}`),

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

  // ── Imagens privadas do artigo (upload em 2 passos) ──────────
  // 1) presign (PUT com TTL 15 min) -> 2) PUT direto no storage ->
  // 3) complete-upload. A leitura usa URL pré-assinada via getImageUrl; o
  // download autenticado é o fallback.
  prepareImageUpload: (articleId: string, data: KbImageUploadRequest) =>
    api.post<PresignedUploadResponse>(
      `${imagesBase(articleId)}/presigned-upload`,
      data,
    ),

  completeImageUpload: (articleId: string, data: KbImageCompleteUploadRequest) =>
    api.post<KbImage>(`${imagesBase(articleId)}/complete-upload`, data),

  listImages: (articleId: string) =>
    api.get<KbImageListItem[]>(imagesBase(articleId)),

  getImageUrl: (articleId: string, attachmentId: string) =>
    api.get<KbImageUrlResponse>(
      `${imagesBase(articleId)}/${attachmentId}/url`,
    ),

  downloadImage: (articleId: string, attachmentId: string) =>
    downloadImageBlob(articleId, attachmentId),

  deleteImage: (articleId: string, attachmentId: string) =>
    api.del<void>(`${imagesBase(articleId)}/${attachmentId}`),

  /**
   * Exclusão DEFINITIVA: remove o objeto do storage agora (sem os 30 dias do
   * soft delete) e revoga links pré-assinados vigentes. Exige permissão de
   * exclusão na KB.
   */
  permanentDeleteImage: (articleId: string, attachmentId: string) =>
    api.del<void>(`${imagesBase(articleId)}/${attachmentId}/permanent`),

  chatSearch: (data: KbSearchRequest) =>
    api.post<KbSuggestResult>(`${BASE}/chat-search`, data),

  // Endpoints reais do backend: /tickets/{id}/knowledge-links (DELETE por linkId).
  listTicketKnowledge: (ticketId: string) =>
    api.get<TicketKnowledgeLinkResponse[]>(`/api/v1/tickets/${ticketId}/knowledge-links`),

  linkTicketKnowledge: (ticketId: string, data: LinkTicketKnowledgeRequest) =>
    api.post<TicketKnowledgeLinkResponse>(`/api/v1/tickets/${ticketId}/knowledge-links`, data),

  unlinkTicketKnowledge: (ticketId: string, linkId: string) =>
    api.del<void>(`/api/v1/tickets/${ticketId}/knowledge-links/${linkId}`),

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
