import { useQuery } from "@tanstack/react-query";
import { p2pApi, type P2PTimeseriesParams } from "@/api/p2p";

const P2P_KEYS = {
  timeseries: (params: P2PTimeseriesParams) => ["p2p", "timeseries", params] as const,
};

export function useP2PTimeseries(params: P2PTimeseriesParams, enabled = true) {
  return useQuery({
    queryKey: P2P_KEYS.timeseries(params),
    queryFn: () => p2pApi.getTimeseries(params),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });
}
