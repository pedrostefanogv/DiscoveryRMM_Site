import {
  useMutation,
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { notesApi } from "@/api";
import type { CreateNoteRequest, UpdateNoteRequest } from "@/api";
import type { Note, CursorPageDto } from "@/api/types";

const KEYS = {
  all: ["notes"] as const,
  byClient: (clientId: string) => [...KEYS.all, "byClient", clientId] as const,
  byClientPage: (clientId: string) =>
    [...KEYS.all, "byClientPage", clientId] as const,
  bySite: (siteId: string) => [...KEYS.all, "bySite", siteId] as const,
  bySitePage: (siteId: string) => [...KEYS.all, "bySitePage", siteId] as const,
  byAgent: (agentId: string) => [...KEYS.all, "byAgent", agentId] as const,
  byAgentPage: (agentId: string) =>
    [...KEYS.all, "byAgentPage", agentId] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

// ── Legacy hooks (sem paginação) ───────────────────────────

export function useClientNotes(clientId: string) {
  return useQuery({
    queryKey: KEYS.byClient(clientId),
    queryFn: () => notesApi.listByClient(clientId),
    enabled: !!clientId,
  });
}

export function useSiteNotes(siteId: string) {
  return useQuery({
    queryKey: KEYS.bySite(siteId),
    queryFn: () => notesApi.listBySite(siteId),
    enabled: !!siteId,
  });
}

export function useAgentNotes(agentId: string) {
  return useQuery({
    queryKey: KEYS.byAgent(agentId),
    queryFn: () => notesApi.listByAgent(agentId),
    enabled: !!agentId,
  });
}

// ── Cursor pagination hooks (NOVO) ─────────────────────────

export function useClientNotesPage(clientId: string, limit = 20) {
  return useInfiniteQuery<CursorPageDto<Note>>({
    queryKey: KEYS.byClientPage(clientId),
    queryFn: ({ pageParam }) =>
      notesApi.listClientNotesPage(clientId, {
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!clientId,
  });
}

export function useSiteNotesPage(siteId: string, limit = 20) {
  return useInfiniteQuery<CursorPageDto<Note>>({
    queryKey: KEYS.bySitePage(siteId),
    queryFn: ({ pageParam }) =>
      notesApi.listSiteNotesPage(siteId, {
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!siteId,
  });
}

export function useAgentNotesPage(agentId: string, limit = 20) {
  return useInfiniteQuery<CursorPageDto<Note>>({
    queryKey: KEYS.byAgentPage(agentId),
    queryFn: ({ pageParam }) =>
      notesApi.listAgentNotesPage(agentId, {
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!agentId,
  });
}

// ── Detail ─────────────────────────────────────────────────

export function useNote(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => notesApi.get(id),
    enabled: !!id,
  });
}

// ── Mutations ──────────────────────────────────────────────

export function useCreateClientNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      data,
    }: {
      clientId: string;
      data: CreateNoteRequest;
    }) => notesApi.createForClient(clientId, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.byClient(vars.clientId) });
      qc.invalidateQueries({ queryKey: KEYS.byClientPage(vars.clientId) });
    },
  });
}

export function useCreateSiteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteId,
      data,
    }: {
      siteId: string;
      data: CreateNoteRequest;
    }) => notesApi.createForSite(siteId, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.bySite(vars.siteId) });
      qc.invalidateQueries({ queryKey: KEYS.bySitePage(vars.siteId) });
    },
  });
}

export function useCreateAgentNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      data,
    }: {
      agentId: string;
      data: CreateNoteRequest;
    }) => notesApi.createForAgent(agentId, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.byAgent(vars.agentId) });
      qc.invalidateQueries({ queryKey: KEYS.byAgentPage(vars.agentId) });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNoteRequest }) =>
      notesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}
