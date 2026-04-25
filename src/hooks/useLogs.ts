import { useQuery } from "@tanstack/react-query";
import { logsApi } from "@/api";
import type { LogsQuery } from "@/api";

const KEYS = {
  all: ["logs"] as const,
  list: (params: LogsQuery) => [...KEYS.all, "list", params] as const,
};

export function useLogs(params: LogsQuery = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => logsApi.list(params),
  });
}
