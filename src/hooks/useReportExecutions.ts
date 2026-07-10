import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as reportsApi from "@/api/reports";
import type {
  CursorPageDto,
  ReportExecution,
  RunReportRequest,
} from "@/api/types";

const KEYS = {
  all: ["reportExecutions"] as const,
  list: (params?: { clientId?: string; limit?: number }) =>
    [...KEYS.all, "list", params] as const,
  detail: (id: string, clientId?: string) =>
    [...KEYS.all, "detail", id, clientId] as const,
};

function normalizeArray<T>(data: CursorPageDto<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return (data as CursorPageDto<T>).items ?? [];
}

export function useReportExecutions(params?: {
  clientId?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => reportsApi.getReportExecutions(params),
    select: (data) =>
      normalizeArray(
        data as CursorPageDto<ReportExecution> | ReportExecution[],
      ),
  });
}

export function useReportExecution(id: string, clientId?: string) {
  return useQuery({
    queryKey: KEYS.detail(id, clientId),
    queryFn: () => reportsApi.getReportExecution(id, clientId),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Auto-refresh while pending or running (status 0 or 1)
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
