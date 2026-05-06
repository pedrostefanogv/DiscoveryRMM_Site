import { useQuery } from "@tanstack/react-query";
import { p2pApi, type P2PAgentsRankingParams } from "@/api/p2p";

const P2P_KEYS = {
  agentsRanking: (params: P2PAgentsRankingParams) =>
    ["p2p", "agents-ranking", params] as const,
};

export function useP2PAgentsRanking(
  params: P2PAgentsRankingParams,
  enabled = true,
) {
  return useQuery({
    queryKey: P2P_KEYS.agentsRanking(params),
    queryFn: () => p2pApi.getAgentsRanking(params),
    enabled,
    staleTime: 30_000,
    refetchInterval: 300_000,
    refetchIntervalInBackground: true,
  });
}
