import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { backgroundProcessingApi } from "@/api";
import type { ProcessingScopeStateDto } from "@/api";

const KEYS = {
  effective: (clientId?: string | null) => ["background-processing", "effective", clientId ?? "global"] as const,
  status: (clientId?: string | null) => ["background-processing", "status", clientId ?? "all"] as const,
  schedule: ["background-processing", "schedule"] as const,
};

/** Configuração efetiva (global + override do escopo). */
export function useBackgroundProcessingEffective(clientId?: string | null, enabled = true) {
  return useQuery({
    queryKey: KEYS.effective(clientId),
    queryFn: () => backgroundProcessingApi.effective(clientId),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Último ciclo por escopo (processing_scope_state).
 *
 * Polling adaptativo: 10s enquanto houver backfill pendente/em andamento (para o
 * progresso andar na tela) e 60s quando está tudo parado.
 */
export function useBackgroundProcessingStatus(
  clientId?: string | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: KEYS.status(clientId),
    queryFn: () => backgroundProcessingApi.status(clientId),
    enabled: options.enabled ?? true,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as ProcessingScopeStateDto[];
      const runningBackfill = rows.some(
        (row) =>
          row.scopeType === "technician_metrics_backfill" &&
          /"(?:status|Status)"\s*:\s*"(?:pending|running)"/.test(row.lastResultJson ?? ""),
      );
      return runningBackfill ? 10_000 : 60_000;
    },
  });
}

/** Tick aplicado vs desejado e próximo disparo. */
export function useBackgroundProcessingSchedule(enabled = true) {
  return useQuery({
    queryKey: KEYS.schedule,
    queryFn: () => backgroundProcessingApi.schedule(),
    enabled,
    staleTime: 30_000,
  });
}

/** Pede o backfill (recálculo forçado) dos snapshots do escopo. */
export function useRequestBackgroundBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, purgeOrphans }: { clientId?: string | null; purgeOrphans?: boolean }) =>
      backgroundProcessingApi.requestBackfill(clientId, purgeOrphans ?? false),
    onSuccess: (_state, variables) => {
      void qc.invalidateQueries({ queryKey: KEYS.status(variables.clientId) });
    },
  });
}

/** Cancela o backfill pendente/em andamento do escopo. */
export function useCancelBackgroundBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId }: { clientId?: string | null }) =>
      backgroundProcessingApi.cancelBackfill(clientId),
    onSuccess: (_result, variables) => {
      void qc.invalidateQueries({ queryKey: KEYS.status(variables.clientId) });
    },
  });
}
