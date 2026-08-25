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
  byClientPage: (clientId: string) =>
    [...KEYS.all, "byClientPage", clientId] as const,
  bySitePage: (siteId: string) => [...KEYS.all, "bySitePage", siteId] as const,
  byAgentPage: (agentId: string) =>
    [...KEYS.all, "byAgentPage", agentId] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

// ── Cursor pagination hooks ──────────────────────────────

export function useClientNotesPage(clientId: string, limit = 20) {
  return useInfiniteQuery<CursorPageDto<Note>>({
    queryKey: KEYS.byClientPage(clientId),
    queryFn: ({ pageParam }) =>
      notesApi.listNotesPage({
        clientId,
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
      notesApi.listNotesPage({
        siteId,
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
      notesApi.listNotesPage({
        agentId,
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
    }) => notesApi.create({ clientId }, data),
    onSuccess: (_d, vars) => {
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
    }) => notesApi.create({ siteId }, data),
    onSuccess: (_d, vars) => {
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
    }) => notesApi.create({ agentId }, data),
    onSuccess: (_d, vars) => {
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
