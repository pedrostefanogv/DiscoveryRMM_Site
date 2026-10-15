import { useMutation, useQuery } from "@tanstack/react-query";
import { objectStorageSanitizationApi, type ObjectStorageSanitizationRequest } from "@/api";

const KEYS = {
  checks: ["object-storage-sanitization", "checks"] as const,
};

/** Verificações de sanitização do object storage (títulos/descrições para a tela). */
export function useObjectStorageSanitizationChecks() {
  return useQuery({
    queryKey: KEYS.checks,
    queryFn: () => objectStorageSanitizationApi.checks(),
    staleTime: 300_000,
  });
}

/** Varre o bucket e, quando aplicado, remove os assets da loja sem vínculo. */
export function useRunObjectStorageSanitization() {
  return useMutation({
    mutationFn: (payload: ObjectStorageSanitizationRequest) =>
      objectStorageSanitizationApi.run(payload),
  });
}
