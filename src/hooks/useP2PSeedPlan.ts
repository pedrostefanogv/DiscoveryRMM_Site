import { useQuery } from "@tanstack/react-query";
import { p2pApi, type P2PQueryScope } from "@/api/p2p";

const P2P_KEYS = {
  seedPlan: (scope: P2PQueryScope) => ["p2p", "seed-plan", scope] as const,
};

export function useP2PSeedPlan(scope: P2PQueryScope, enabled = true) {
  return useQuery({
    queryKey: P2P_KEYS.seedPlan(scope),
    queryFn: () => p2pApi.getSeedPlan(scope),
    enabled,
    staleTime: 30_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: true,
  });
}
