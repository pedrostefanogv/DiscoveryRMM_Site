import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { databaseMaintenanceApi, jobsApi } from "@/api";

const KEYS = {
  health: ["database-maintenance", "health"] as const,
  runs: ["database-maintenance", "runs"] as const,
};

/** Diagnóstico físico do banco (índices inválidos, bloat, XID, estatísticas). */
export function useDatabaseHealth(enabled = true) {
  return useQuery({
    queryKey: KEYS.health,
    queryFn: () => databaseMaintenanceApi.health(),
    enabled,
    staleTime: 60_000,
  });
}

/** Histórico persistido das execuções da manutenção física. */
export function useDatabaseMaintenanceRuns(enabled = true) {
  return useQuery({
    queryKey: KEYS.runs,
    queryFn: () => databaseMaintenanceApi.runs(10),
    enabled,
    staleTime: 60_000,
  });
}

/** Dispara a manutenção física (job Quartz) imediatamente. */
export function useRunDatabaseMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => jobsApi.trigger("maintenance", "database-maintenance"),
    onSuccess: () => {
      // O job roda em segundo plano; invalida o histórico para o operador
      // recarregar quando ele terminar.
      void queryClient.invalidateQueries({ queryKey: KEYS.runs });
      void queryClient.invalidateQueries({ queryKey: KEYS.health });
    },
  });
}
