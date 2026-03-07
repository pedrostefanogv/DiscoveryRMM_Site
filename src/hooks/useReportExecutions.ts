import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as reportsApi from "@/api/reports";
import type { RunReportRequest } from "@/api/types";

const KEYS = {
  all: ["reportExecutions"] as const,
  list: (clientId: string, limit?: number) =>
    [...KEYS.all, "list", clientId, limit] as const,
  detail: (id: string, clientId: string) =>
    [...KEYS.all, "detail", id, clientId] as const,
};

export function useReportExecutions(clientId: string, limit?: number) {
  return useQuery({
    queryKey: KEYS.list(clientId, limit),
    queryFn: () => reportsApi.getReportExecutions(clientId, limit),
    enabled: !!clientId,
  });
}

export function useReportExecution(id: string, clientId: string) {
  return useQuery({
    queryKey: KEYS.detail(id, clientId),
    queryFn: () => reportsApi.getReportExecution(id, clientId),
    enabled: !!id && !!clientId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Auto-refresh while pending or processing
      if (data?.status === 0 || data?.status === 1) {
        return 2000; // Poll every 2 seconds
      }
      return false;
    },
  });
}

export function useRunReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RunReportRequest) => reportsApi.runReport(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
