import { useQuery, keepPreviousData } from "@tanstack/react-query";
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

interface SoftwareInstallationsParams {
  softwareId: string;
  scope: SoftwareInventoryScope;
  clientId?: string;
  siteId?: string;
  cursor?: string;
  limit?: number;
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
      const scope = params.scope;
      let scopeId: string | undefined;
      if (scope === "client") scopeId = params.clientId;
      else if (scope === "site") scopeId = params.siteId;

      return softwareInventoryApi.list({
        cursor: params.cursor,
        limit: safeLimit,
        search: safeSearch,
        order: safeOrder,
        scope,
        scopeId,
      });
    },
    enabled: hasScopeTarget,
    placeholderData: keepPreviousData,
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
      let scopeId: string | undefined;
      if (scope === "client") scopeId = clientId;
      else if (scope === "site") scopeId = siteId;
      return softwareInventoryApi.snapshot({ scope, scopeId });
    },
    enabled: hasScopeTarget,
  });
}

export function useSoftwareInstallations(params: SoftwareInstallationsParams) {
  const safeLimit = Math.min(500, Math.max(1, params.limit ?? 50));
  const safeOrder: AgentSoftwareOrder = params.order === "desc" ? "desc" : "asc";

  return useQuery({
    queryKey: [
      ...KEYS.all,
      "installations",
      params.softwareId,
      params.scope,
      params.clientId ?? null,
      params.siteId ?? null,
      params.cursor ?? null,
      safeLimit,
      safeOrder,
    ],
    queryFn: () => {
      let scopeId: string | undefined;
      if (params.scope === "client") scopeId = params.clientId;
      else if (params.scope === "site") scopeId = params.siteId;

      return softwareInventoryApi.installations(params.softwareId, {
        scope: params.scope,
        scopeId,
        cursor: params.cursor,
        limit: safeLimit,
        order: safeOrder,
      });
    },
    enabled: !!params.softwareId,
    placeholderData: keepPreviousData,
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
      let scopeId: string | undefined;
      if (scope === "client") scopeId = params?.clientId;
      else if (scope === "site") scopeId = params?.siteId;
      return softwareInventoryApi.top({ scope, scopeId, limit: safeLimit });
    },
    enabled: hasScopeTarget,
  });
}
