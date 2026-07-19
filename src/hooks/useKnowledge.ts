import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { knowledgeApi } from "@/api";
import type {
  CreateKnowledgeArticleRequest,
  KbSearchRequest,
  KnowledgeListQuery,
  KnowledgeSearchQuery,
  LinkTicketKnowledgeRequest,
  PublishArticleRequest,
  TicketKnowledgeSuggestQuery,
  UpdateKnowledgeArticleRequest,
} from "@/api";

const KEYS = {
  all: ["knowledge"] as const,
  list: (params?: KnowledgeListQuery) => [...KEYS.all, "list", params] as const,
  allVisible: (params?: { cursor?: string; limit?: number; status?: string; category?: string; clientId?: string; siteId?: string; departmentId?: string }) => [...KEYS.all, "all-visible", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  versions: (id: string) => [...KEYS.all, "versions", id] as const,
  version: (id: string, versionNumber: number) =>
    [...KEYS.all, "version", id, versionNumber] as const,
  search: (params: KnowledgeSearchQuery) =>
    [...KEYS.all, "search", params] as const,
  chatSearch: (params: KbSearchRequest) =>
    [...KEYS.all, "chat-search", params] as const,
  ticketLinks: (ticketId: string) =>
    [...KEYS.all, "ticket-links", ticketId] as const,
  ticketSuggest: (ticketId: string, params?: TicketKnowledgeSuggestQuery) =>
    [...KEYS.all, "ticket-suggest", ticketId, params] as const,
};

export function useKnowledgeArticles(params?: KnowledgeListQuery) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => knowledgeApi.list(params),
  });
}

export function useKnowledgeAllArticles(params?: {
  cursor?: string;
  limit?: number;
  status?: string;
  category?: string;
  clientId?: string;
  siteId?: string;
  departmentId?: string;
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
      articleId,
    }: {
      ticketId: string;
      articleId: string;
    }) => knowledgeApi.unlinkTicketKnowledge(ticketId, articleId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.ticketLinks(vars.ticketId) });
      qc.invalidateQueries({ queryKey: KEYS.ticketSuggest(vars.ticketId) });
    },
  });
}
