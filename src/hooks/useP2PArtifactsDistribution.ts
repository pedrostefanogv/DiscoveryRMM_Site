import { useQuery } from "@tanstack/react-query";
import { p2pApi, type P2PArtifactsDistributionParams } from "@/api/p2p";

const P2P_KEYS = {
  artifactsDistribution: (params: P2PArtifactsDistributionParams) =>
    ["p2p", "artifacts-distribution", params] as const,
};

export function useP2PArtifactsDistribution(
  params: P2PArtifactsDistributionParams,
  enabled = true,
) {
  return useQuery({
    queryKey: P2P_KEYS.artifactsDistribution(params),
    queryFn: () => p2pApi.getArtifactsDistribution(params),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
}
