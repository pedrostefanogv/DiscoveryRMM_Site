import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notesApi } from "@/api";
import type { CreateNoteRequest, UpdateNoteRequest } from "@/api";

const KEYS = {
  all: ["notes"] as const,
  byClient: (clientId: string) => [...KEYS.all, "byClient", clientId] as const,
  bySite: (siteId: string) => [...KEYS.all, "bySite", siteId] as const,
  byAgent: (agentId: string) => [...KEYS.all, "byAgent", agentId] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

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

export function useNote(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => notesApi.get(id),
    enabled: !!id,
  });
}

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
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.byClient(vars.clientId) }),
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
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.bySite(vars.siteId) }),
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
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.byAgent(vars.agentId) }),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateNoteRequest }) =>
      notesApi.update(id, data),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) }),
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
