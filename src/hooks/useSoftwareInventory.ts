import { useQuery } from "@tanstack/react-query";
import { softwareInventoryApi } from "@/api";
import type { AgentSoftwareOrder } from "@/api";

export type SoftwareInventoryScope = "global" | "client" | "site";

interface SoftwareInventoryListParams {
  scope: SoftwareInventoryScope;
  clientId?: string;
  siteId?: string;
  cursor?: string;
  limit?: number;
  search?: string;
  order?: AgentSoftwareOrder;
}

const KEYS = {
  all: ["softwareInventory"] as const,
  list: (params: {
    scope: SoftwareInventoryScope;
    clientId?: string;
    siteId?: string;
    cursor?: string;
    limit: number;
    search: string;
    order: AgentSoftwareOrder;
  }) => [...KEYS.all, "list", params] as const,
  snapshot: (
    scope: SoftwareInventoryScope,
    clientId?: string,
    siteId?: string,
  ) =>
    [...KEYS.all, "snapshot", scope, clientId ?? null, siteId ?? null] as const,
};

export function useSoftwareInventoryList(params: SoftwareInventoryListParams) {
  const safeLimit = Math.min(500, Math.max(1, params.limit ?? 10));
  const safeSearch = params.search?.trim() ?? "";
  const safeOrder: AgentSoftwareOrder = params.order === "asc" ? "asc" : "desc";

  const hasScopeTarget =
    params.scope === "global" ||
    (params.scope === "client" && !!params.clientId) ||
    (params.scope === "site" && !!params.siteId);

  return useQuery({
    queryKey: KEYS.list({
      scope: params.scope,
      clientId: params.clientId,
      siteId: params.siteId,
      cursor: params.cursor,
      limit: safeLimit,
      search: safeSearch,
      order: safeOrder,
    }),
    queryFn: () => {
      if (params.scope === "client") {
        return softwareInventoryApi.listByClient(params.clientId!, {
          cursor: params.cursor,
          limit: safeLimit,
          search: safeSearch,
          order: safeOrder,
        });
      }

      if (params.scope === "site") {
        return softwareInventoryApi.listBySite(params.siteId!, {
          cursor: params.cursor,
          limit: safeLimit,
          search: safeSearch,
          order: safeOrder,
        });
      }

      return softwareInventoryApi.list({
        cursor: params.cursor,
        limit: safeLimit,
        search: safeSearch,
        order: safeOrder,
      });
    },
    enabled: hasScopeTarget,
  });
}

export function useSoftwareInventorySnapshot(
  scope: SoftwareInventoryScope,
  clientId?: string,
  siteId?: string,
) {
  const hasScopeTarget =
    scope === "global" ||
    (scope === "client" && !!clientId) ||
    (scope === "site" && !!siteId);

  return useQuery({
    queryKey: KEYS.snapshot(scope, clientId, siteId),
    queryFn: () => {
      if (scope === "client")
        return softwareInventoryApi.snapshotByClient(clientId!);
      if (scope === "site") return softwareInventoryApi.snapshotBySite(siteId!);
      return softwareInventoryApi.snapshot();
    },
    enabled: hasScopeTarget,
  });
}

export function useSoftwareInventoryTop(
  scope: SoftwareInventoryScope,
  params?: {
    clientId?: string;
    siteId?: string;
    limit?: number;
  },
) {
  const safeLimit = Math.min(200, Math.max(1, params?.limit ?? 20));

  const hasScopeTarget =
    scope === "global" || (scope === "site" && !!params?.siteId);

  return useQuery({
    queryKey: [
      ...KEYS.all,
      "top",
      scope,
      params?.clientId ?? null,
      params?.siteId ?? null,
      safeLimit,
    ],
    queryFn: () => {
      if (scope === "site") {
        return softwareInventoryApi.topBySite(params!.siteId!, safeLimit);
      }

      return softwareInventoryApi.top(safeLimit);
    },
    enabled: hasScopeTarget,
  });
}
