import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { knowledgeApi } from "@/api";
import { buildKbImageToken, isPresignedUrlValid } from "@/utils/kbImage";
import type {
  CreateArticlePageRequest,
  CreateKnowledgeArticleRequest,
  KbImageListItem,
  KbSearchRequest,
  KnowledgeSearchQuery,
  LinkTicketKnowledgeRequest,
  PublishArticleRequest,
  TicketKnowledgeSuggestQuery,
  UpdateArticlePageRequest,
  UpdateKnowledgeArticleRequest,
} from "@/api";

const KEYS = {
  all: ["knowledge"] as const,
  allVisible: (params?: { cursor?: string; limit?: number; status?: string; category?: string; clientId?: string; siteId?: string; departmentId?: string; sortBy?: string; sortDirection?: string }) => [...KEYS.all, "all-visible", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  versions: (id: string) => [...KEYS.all, "versions", id] as const,
  version: (id: string, versionNumber: number) =>
    [...KEYS.all, "version", id, versionNumber] as const,
  images: (articleId: string) => [...KEYS.all, "images", articleId] as const,
  imageUrl: (articleId: string, attachmentId: string) =>
    [...KEYS.all, "image-url", articleId, attachmentId] as const,
  pages: (articleId: string) => [...KEYS.all, "pages", articleId] as const,
  page: (articleId: string, pageId: string) => [...KEYS.all, "page", articleId, pageId] as const,
  search: (params: KnowledgeSearchQuery) =>
    [...KEYS.all, "search", params] as const,
  chatSearch: (params: KbSearchRequest) =>
    [...KEYS.all, "chat-search", params] as const,
  ticketLinks: (ticketId: string) =>
    [...KEYS.all, "ticket-links", ticketId] as const,
  ticketSuggest: (ticketId: string, params?: TicketKnowledgeSuggestQuery) =>
    [...KEYS.all, "ticket-suggest", ticketId, params] as const,
};

export function useKnowledgeAllArticles(params?: {
  cursor?: string;
  limit?: number;
  status?: string;
  category?: string;
  clientId?: string;
  siteId?: string;
  departmentId?: string;
  sortBy?: string;
  sortDirection?: string;
}) {
  return useQuery({
    queryKey: KEYS.allVisible({
      cursor: params?.cursor,
      limit: params?.limit,
      status: params?.status,
      category: params?.category,
      clientId: params?.clientId,
      siteId: params?.siteId,
      departmentId: params?.departmentId,
      sortBy: params?.sortBy,
      sortDirection: params?.sortDirection,
    }),
    queryFn: () =>
      knowledgeApi.listAllVisible({
        cursor: params?.cursor,
        limit: params?.limit,
        status: params?.status as import('@/api').ArticleStatus | undefined,
        category: params?.category,
        clientId: params?.clientId,
        siteId: params?.siteId,
        departmentId: params?.departmentId,
        sortBy: params?.sortBy,
        sortDirection: params?.sortDirection,
      }),
  });
}

export function useKnowledgeArticle(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => knowledgeApi.get(id),
    enabled: !!id,
  });
}

// ── Sub-páginas internas do artigo ──────────────────────────────

export function useArticlePages(articleId: string) {
  return useQuery({
    queryKey: KEYS.pages(articleId),
    queryFn: () => knowledgeApi.getPages(articleId),
    enabled: !!articleId,
  });
}

export function useArticlePage(articleId: string, pageId: string) {
  return useQuery({
    queryKey: KEYS.page(articleId, pageId),
    queryFn: () => knowledgeApi.getPage(articleId, pageId),
    enabled: !!articleId && !!pageId,
  });
}

export function useCreateArticlePage(articleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateArticlePageRequest) =>
      knowledgeApi.createPage(articleId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.pages(articleId) });
    },
  });
}

export function useUpdateArticlePage(articleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, data }: { pageId: string; data: UpdateArticlePageRequest }) =>
      knowledgeApi.updatePage(articleId, pageId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.pages(articleId) });
      qc.invalidateQueries({ queryKey: KEYS.page(articleId, vars.pageId) });
    },
  });
}

export function useDeleteArticlePage(articleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => knowledgeApi.deletePage(articleId, pageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.pages(articleId) });
    },
  });
}

// ── Imagens privadas do artigo ────────────────────────────────

/** Lista as imagens registradas no artigo (com URL pré-assinada). */
export function useArticleImages(articleId: string) {
  return useQuery({
    queryKey: KEYS.images(articleId),
    queryFn: () => knowledgeApi.listImages(articleId),
    enabled: !!articleId,
  });
}

/**
 * Envia uma imagem em 2 passos e devolve o token Markdown pronto:
 * presign -> PUT direto na URL absoluta (sem Bearer e sem o client da API)
 * -> complete-upload.
 */
export function useUploadArticleImage(articleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      size,
    }: {
      file: File;
      /** Tamanho opcional ("50%" / "420"); null = largura natural. */
      size?: string | null;
    }): Promise<string> => {
      const contentType = (file.type || "").toLowerCase();

      const prepared = await knowledgeApi.prepareImageUpload(articleId, {
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
      });

      // O PUT vai direto no storage: a URL é absoluta e NÃO leva Authorization.
      const response = await fetch(prepared.uploadUrl, {
        method: prepared.httpMethod || "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });

      if (!response.ok) {
        throw new Error(`Falha no envio da imagem (HTTP ${response.status}).`);
      }

      const image = await knowledgeApi.completeImageUpload(articleId, {
        attachmentId: prepared.attachmentId,
        objectKey: prepared.objectKey,
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
      });

      return buildKbImageToken(image.id, image.fileName, size);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.images(articleId) });
    },
  });
}

/** Exclui uma imagem do artigo (DELETE /images/{attachmentId}). */
export function useDeleteArticleImage(articleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      knowledgeApi.deleteImage(articleId, attachmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.images(articleId) });
      // O backend remove a referência do artigo E das sub-páginas: recarrega a
      // árvore para o painel/editor não mostrarem o token de uma imagem excluída.
      qc.invalidateQueries({ queryKey: KEYS.pages(articleId) });
    },
  });
}

export interface KnowledgeImageUrlState {
  url: string | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Resolve a URL pré-assinada de leitura de uma imagem privada.
 *
 * Usa a URL da lista de imagens em cache quando ainda válida (TTL 4h); se
 * estiver ausente/expirada, busca em GET /images/{attachmentId}/url. URLs
 * pré-assinadas nunca são tratadas como cache permanente.
 */
export function useKnowledgeImageUrl(
  articleId: string,
  attachmentId: string,
  enabled = true,
): KnowledgeImageUrlState {
  const qc = useQueryClient();
  const active = enabled && !!articleId && !!attachmentId;

  // Leitura do cache da lista sem disparar o fetch dela: a resolução pontual
  // usa o endpoint de URL. Quando o painel já carregou a lista, aproveitamos.
  const cachedList = active
    ? qc.getQueryData<KbImageListItem[]>(KEYS.images(articleId))
    : undefined;
  const cachedImage = cachedList?.find((item) => item.id === attachmentId);
  const cachedUrl =
    cachedImage && isPresignedUrlValid(cachedImage.urlExpiresAtUtc)
      ? cachedImage.url
      : null;

  const query = useQuery({
    queryKey: KEYS.imageUrl(articleId, attachmentId),
    queryFn: () => knowledgeApi.getImageUrl(articleId, attachmentId),
    enabled: active && !cachedUrl,
    // URL pré-assinada é efêmera: sempre revalida ao montar.
    staleTime: 0,
  });

  const fetchedUrl =
    query.data && isPresignedUrlValid(query.data.expiresAtUtc)
      ? query.data.url
      : null;

  // URL expirada com a tela JÁ aberta: o react-query não refaz sozinho só porque
  // o dado venceu (staleTime 0 revalida em mount/focus), então a imagem ficaria
  // "indisponível" até o usuário sair e voltar. Refaz uma vez por expiração
  // diferente (guarda anti-loop caso o servidor devolva a mesma URL).
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;
  const refetchedExpiryRef = useRef<string | null>(null);
  const expiredExpiry =
    query.data && !isPresignedUrlValid(query.data.expiresAtUtc)
      ? query.data.expiresAtUtc
      : null;

  useEffect(() => {
    if (!active || !expiredExpiry) return;
    if (refetchedExpiryRef.current === expiredExpiry) return;
    refetchedExpiryRef.current = expiredExpiry;
    void refetchRef.current();
  }, [active, expiredExpiry]);

  const url = cachedUrl ?? fetchedUrl;

  return {
    url,
    // Sem URL utilizável, um refetch em andamento (ex.: URL de 4h vencida com a
    // tela aberta) precisa mostrar placeholder — não "Imagem indisponível".
    isLoading: active && !cachedUrl && !url && (query.isLoading || query.isFetching),
    isError: active && !cachedUrl && !url && query.isError,
  };
}

export function useKnowledgeArticleVersions(id: string) {
  return useQuery({
    queryKey: KEYS.versions(id),
    queryFn: () => knowledgeApi.getVersions(id),
    enabled: !!id,
  });
}

export function useKnowledgeArticleVersion(id: string, versionNumber: number) {
  return useQuery({
    queryKey: KEYS.version(id, versionNumber),
    queryFn: () => knowledgeApi.getVersion(id, versionNumber),
    enabled: !!id && versionNumber > 0,
  });
}

export function useKnowledgeSearch(
  params: KnowledgeSearchQuery,
  enabled = true,
) {
  return useQuery({
    queryKey: KEYS.search(params),
    queryFn: () => knowledgeApi.search(params),
    enabled: enabled && !!params.q?.trim(),
  });
}

export function useKnowledgeChatSearch() {
  return useMutation({
    mutationFn: (data: KbSearchRequest) => knowledgeApi.chatSearch(data),
  });
}

export function useCreateKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateKnowledgeArticleRequest) =>
      knowledgeApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: UpdateKnowledgeArticleRequest;
    }) => knowledgeApi.update(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}

export function useDeleteKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => knowledgeApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function usePublishKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PublishArticleRequest }) =>
      knowledgeApi.publish(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: KEYS.versions(vars.id) });
    },
  });
}

export function useUnpublishKnowledgeArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      lastEditedBy,
    }: {
      id: string;
      lastEditedBy?: string;
    }) => knowledgeApi.unpublish(id, lastEditedBy),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}

export function useTicketKnowledgeLinks(ticketId: string) {
  return useQuery({
    queryKey: KEYS.ticketLinks(ticketId),
    queryFn: () => knowledgeApi.listTicketKnowledge(ticketId),
    enabled: !!ticketId,
  });
}
// listTicketKnowledge agora devolve TicketKnowledgeLinkResponse[] (endpoint
// real /knowledge-links); useTicketKnowledgeSuggestions segue igual.

export function useTicketKnowledgeSuggestions(
  ticketId: string,
  params?: TicketKnowledgeSuggestQuery,
) {
  return useQuery({
    queryKey: KEYS.ticketSuggest(ticketId, params),
    queryFn: () => knowledgeApi.suggestTicketKnowledge(ticketId, params),
    enabled: !!ticketId,
  });
}

export function useLinkTicketKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ticketId,
      data,
    }: {
      ticketId: string;
      data: LinkTicketKnowledgeRequest;
    }) => knowledgeApi.linkTicketKnowledge(ticketId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.ticketLinks(vars.ticketId) });
      qc.invalidateQueries({ queryKey: KEYS.ticketSuggest(vars.ticketId) });
    },
  });
}

export function useUnlinkTicketKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ticketId,
      linkId,
    }: {
      ticketId: string;
      linkId: string;
    }) => knowledgeApi.unlinkTicketKnowledge(ticketId, linkId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.ticketLinks(vars.ticketId) });
      qc.invalidateQueries({ queryKey: KEYS.ticketSuggest(vars.ticketId) });
    },
  });
}
