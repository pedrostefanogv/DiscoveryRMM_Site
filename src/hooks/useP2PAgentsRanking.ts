import { useQuery } from "@tanstack/react-query";
import { p2pApi, type P2PPagedParams } from "@/api/p2p";

const P2P_KEYS = {
  agentsRanking: (params: P2PPagedParams) => ["p2p", "agents-ranking", params] as const,
};

export function useP2PAgentsRanking(params: P2PPagedParams, enabled = true) {
  return useQuery({
    queryKey: P2P_KEYS.agentsRanking(params),
    queryFn: () => p2pApi.getAgentsRanking(params),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
}
