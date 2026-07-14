import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { logsApi } from "@/api";
import type { LogsQuery } from "@/api";

const KEYS = {
  all: ["logs"] as const,
  list: (params: LogsQuery) => [...KEYS.all, "list", params] as const,
  page: (params: LogsQuery) => [...KEYS.all, "page", params] as const,
  summary: (params: LogsQuery) => [...KEYS.all, "summary", params] as const,
  scopeOptions: () => [...KEYS.all, "scope-options"] as const,
};

export function useLogs(params: LogsQuery = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => logsApi.list(params),
    select: (data) => data.items ?? [],
  });
}

export function useLogsPage(params: LogsQuery = {}) {
  return useInfiniteQuery({
    queryKey: KEYS.page(params),
    initialPageParam: params.cursor ?? null,
    queryFn: ({ pageParam }) =>
      logsApi.listPage({
        ...params,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useLogSummary(params: LogsQuery = {}) {
  return useQuery({
    queryKey: KEYS.summary(params),
    queryFn: () => logsApi.getSummary(params),
  });
}

export function useLogScopeOptions() {
  return useQuery({
    queryKey: KEYS.scopeOptions(),
    queryFn: () => logsApi.getScopeOptions(),
    staleTime: 5 * 60 * 1000,
  });
}
