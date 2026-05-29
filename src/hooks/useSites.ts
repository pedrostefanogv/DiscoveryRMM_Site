import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sitesApi } from "@/api";
import type { CreateSiteRequest, UpdateSiteRequest } from "@/api";

const KEYS = {
  all: ["sites"] as const,
  byClient: (clientId: string, inactive: boolean) =>
    [...KEYS.all, "byClient", clientId, inactive] as const,
  detail: (clientId: string, id: string) =>
    [...KEYS.all, "detail", clientId, id] as const,
};

export function useSites(clientId?: string, includeInactive = false) {
  return useQuery({
    queryKey: KEYS.byClient(clientId ?? "", includeInactive),
    queryFn: () => sitesApi.list(clientId ?? "", includeInactive),
    enabled: !!clientId,
  });
}

export function useSite(clientId: string, id: string) {
  return useQuery({
    queryKey: KEYS.detail(clientId, id),
    queryFn: () => sitesApi.get(clientId, id),
    enabled: !!clientId && !!id,
  });
}

export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      data,
    }: {
      clientId: string;
      data: CreateSiteRequest;
    }) => sitesApi.create(clientId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      clientId,
      id,
      data,
    }: {
      clientId: string;
      id: string;
      data: UpdateSiteRequest;
    }) => sitesApi.update(clientId, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, id }: { clientId: string; id: string }) =>
      sitesApi.delete(clientId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
