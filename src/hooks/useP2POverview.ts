import { useQuery } from "@tanstack/react-query";
import { p2pApi, type P2POverviewParams } from "@/api/p2p";

const P2P_KEYS = {
  all: ["p2p"] as const,
  overview: (params: P2POverviewParams) => ["p2p", "overview", params] as const,
};

export function useP2POverview(params: P2POverviewParams, enabled = true) {
  return useQuery({
    queryKey: P2P_KEYS.overview(params),
    queryFn: () => p2pApi.getOverview(params),
    enabled,
    staleTime: 30_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: true,
  });
}
