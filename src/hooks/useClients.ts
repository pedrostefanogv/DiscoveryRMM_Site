import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientsApi } from "@/api";
import type { CreateClientRequest, UpdateClientRequest } from "@/api";

const KEYS = {
  all: ["clients"] as const,
  list: (includeInactive: boolean) =>
    [...KEYS.all, "list", includeInactive] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

export function useClients(includeInactive = false) {
  return useQuery({
    queryKey: KEYS.list(includeInactive),
    queryFn: () => clientsApi.list(includeInactive),
    staleTime: 60_000,
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => clientsApi.get(id),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClientRequest) => clientsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClientRequest }) =>
      clientsApi.update(id, data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.list(false) });
      qc.invalidateQueries({ queryKey: KEYS.list(true) });
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list(false) });
      qc.invalidateQueries({ queryKey: KEYS.list(true) });
    },
  });
}
