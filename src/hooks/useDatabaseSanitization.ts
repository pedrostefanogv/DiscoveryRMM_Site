import { useMutation, useQuery } from "@tanstack/react-query";
import { databaseSanitizationApi } from "@/api";

const KEYS = {
  checks: ["database-sanitization", "checks"] as const,
};

/** Verificações de sanitização disponíveis (títulos/descrições para a tela). */
export function useSanitizationChecks() {
  return useQuery({
    queryKey: KEYS.checks,
    queryFn: () => databaseSanitizationApi.checks(),
    staleTime: 300_000,
  });
}

/** Executa a sanitização (dry-run ou aplicando de fato). */
export function useRunSanitization() {
  return useMutation({
    mutationFn: (payload: { dryRun: boolean; checks?: string[] }) =>
      databaseSanitizationApi.run(payload),
  });
}
