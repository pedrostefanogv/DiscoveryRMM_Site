import { useQuery } from "@tanstack/react-query";
import { p2pApi, type P2PQueryScope } from "@/api/p2p";

const P2P_KEYS = {
  all: ["p2p"] as const,
  overview: (scope: P2PQueryScope) => ["p2p", "overview", scope] as const,
};

export function useP2POverview(scope: P2PQueryScope, enabled = true) {
  return useQuery({
    queryKey: P2P_KEYS.overview(scope),
    queryFn: () => p2pApi.getOverview(scope),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
}
