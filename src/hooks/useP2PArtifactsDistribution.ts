import { useQuery } from "@tanstack/react-query";
import { p2pApi, type P2PPagedParams } from "@/api/p2p";

const P2P_KEYS = {
  artifactsDistribution: (params: P2PPagedParams) =>
    ["p2p", "artifacts-distribution", params] as const,
};

export function useP2PArtifactsDistribution(params: P2PPagedParams, enabled = true) {
  return useQuery({
    queryKey: P2P_KEYS.artifactsDistribution(params),
    queryFn: () => p2pApi.getArtifactsDistribution(params),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
}
