import { useQuery } from "@tanstack/react-query";
import { serviceBoardApi, type ServiceBoardParams } from "@/api/serviceBoard";

const KEYS = {
  all: ["service-board"] as const,
  get: (params: ServiceBoardParams) =>
    [...KEYS.all, params.clientId ?? null, params.siteId ?? null, params.limit ?? null] as const,
};

/** Polling de 30s: o board é uma visão operacional que muda com frequência. */
export const SERVICE_BOARD_REFETCH_INTERVAL_MS = 30_000;

export function useServiceBoard(params: ServiceBoardParams = {}) {
  return useQuery({
    queryKey: KEYS.get(params),
    queryFn: () => serviceBoardApi.get(params),
    refetchInterval: SERVICE_BOARD_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous,
  });
}
