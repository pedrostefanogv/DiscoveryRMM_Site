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
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
