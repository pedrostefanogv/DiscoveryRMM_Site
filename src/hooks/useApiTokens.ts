import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiTokensApi } from "@/api";
import type { CreateApiTokenRequest } from "@/api";

const KEYS = {
  all: ["api-tokens"] as const,
  list: () => [...KEYS.all, "list"] as const,
};

export function useApiTokens() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: () => apiTokensApi.list(),
  });
}

export function useCreateApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApiTokenRequest) => apiTokensApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useDeleteApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => apiTokensApi.delete(tokenId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
