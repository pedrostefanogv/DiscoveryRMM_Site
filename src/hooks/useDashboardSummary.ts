import { useQuery } from "@tanstack/react-query";
import {
  dashboardApi,
  type DashboardSummaryDto,
  type DashboardWindow,
} from "@/api/dashboard";

type GlobalScope = "global";
type ClientScope = { clientId: string };
type SiteScope = { clientId: string; siteId: string };
type DashboardScope = GlobalScope | ClientScope | SiteScope;

interface UseDashboardSummaryOptions {
  enabled?: boolean;
  refetchInterval?: number;
}

function buildQueryKey(scope: DashboardScope, window: DashboardWindow) {
  if (scope === "global") return ["dashboard", "global", window];
  if ("siteId" in scope)
    return ["dashboard", "site", scope.clientId, scope.siteId, window];
  return ["dashboard", "client", scope.clientId, window];
}

function buildQueryFn(scope: DashboardScope, window: DashboardWindow) {
  // Propaga o signal do TanStack Query: navegar para fora cancela a request.
  return ({ signal }: { signal: AbortSignal }): Promise<DashboardSummaryDto> => {
    if (scope === "global") {
      return dashboardApi.getGlobalSummary(window, { signal });
    }
    if ("siteId" in scope) {
      return dashboardApi.getSiteSummary(scope.clientId, scope.siteId, window, {
        signal,
      });
    }
    return dashboardApi.getClientSummary(scope.clientId, window, { signal });
  };
}

export function useDashboardSummary(
  scope: DashboardScope,
  window: DashboardWindow = "24h",
  options: UseDashboardSummaryOptions = {},
) {
  const { enabled = true, refetchInterval = 300_000 } = options;

  return useQuery<DashboardSummaryDto>({
    queryKey: buildQueryKey(scope, window),
    queryFn: buildQueryFn(scope, window),
    enabled,
    staleTime: 30_000,
    refetchInterval,
    refetchIntervalInBackground: false,
  });
}
