import { api } from "./client";
import type {
  SoftwareInventoryCatalogPage,
  AgentSoftwareOrder,
  SoftwareInventorySnapshot,
  SoftwareInventoryTopResponse,
} from "./types";

const BASE = "/api/software-inventory";

interface SoftwareInventoryParams {
  cursor?: string;
  limit?: number;
  search?: string;
  order?: AgentSoftwareOrder;
}

export const softwareInventoryApi = {
  list: (params?: SoftwareInventoryParams) =>
    api.get<SoftwareInventoryCatalogPage>(BASE, {
      cursor: params?.cursor,
      limit: params?.limit,
      search: params?.search,
      order: params?.order,
    }),

  listByClient: (clientId: string, params?: SoftwareInventoryParams) =>
    api.get<SoftwareInventoryCatalogPage>(`${BASE}/by-client/${clientId}`, {
      cursor: params?.cursor,
      limit: params?.limit,
      search: params?.search,
      order: params?.order,
    }),

  listBySite: (siteId: string, params?: SoftwareInventoryParams) =>
    api.get<SoftwareInventoryCatalogPage>(`${BASE}/by-site/${siteId}`, {
      cursor: params?.cursor,
      limit: params?.limit,
      search: params?.search,
      order: params?.order,
    }),

  snapshot: () => api.get<SoftwareInventorySnapshot>(`${BASE}/snapshot`),

  snapshotByClient: (clientId: string) =>
    api.get<SoftwareInventorySnapshot>(
      `${BASE}/by-client/${clientId}/snapshot`,
    ),

  snapshotBySite: (siteId: string) =>
    api.get<SoftwareInventorySnapshot>(`${BASE}/by-site/${siteId}/snapshot`),

  top: (limit = 20) =>
    api.get<SoftwareInventoryTopResponse>(`${BASE}/top`, { limit }),

  topBySite: (siteId: string, limit = 20) =>
    api.get<SoftwareInventoryTopResponse>(`${BASE}/by-site/${siteId}/top`, {
      limit,
    }),
};
