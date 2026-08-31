import { api } from "./client";
import type {
  SoftwareInventoryCatalogPage,
  AgentSoftwareOrder,
  SoftwareInventorySnapshot,
  SoftwareInventoryTopResponse,
  SoftwareInstallationsPage,
} from "./types";

const BASE = "/api/v1/software-inventory";

export type SoftwareInventoryScope = "global" | "client" | "site";

interface SoftwareInventoryParams {
  cursor?: string;
  limit?: number;
  search?: string;
  order?: AgentSoftwareOrder;
  scope?: SoftwareInventoryScope;
  scopeId?: string;
}

export const softwareInventoryApi = {
  /** Lista paginada via cursor. Escopo definido por query params scope/scopeId. */
  list: (params?: SoftwareInventoryParams) =>
    api.get<SoftwareInventoryCatalogPage>(BASE, {
      cursor: params?.cursor,
      limit: params?.limit,
      search: params?.search,
      order: params?.order,
      scope: params?.scope,
      scopeId: params?.scopeId,
    }),

  /** Snapshot agregado. Escopo definido por query params scope/scopeId. */
  snapshot: (params?: { scope?: SoftwareInventoryScope; scopeId?: string }) =>
    api.get<SoftwareInventorySnapshot>(`${BASE}/snapshot`, {
      scope: params?.scope,
      scopeId: params?.scopeId,
    }),

  top: (params?: {
    scope?: SoftwareInventoryScope;
    scopeId?: string;
    limit?: number;
  }) =>
    api.get<SoftwareInventoryTopResponse>(`${BASE}/top`, {
      scope: params?.scope,
      scopeId: params?.scopeId,
      limit: params?.limit,
    }),

  /** Instalações de um software específico, com escopo opcional (modal de detalhes). */
  installations: (
    softwareId: string,
    params?: {
      scope?: SoftwareInventoryScope;
      scopeId?: string;
      cursor?: string;
      limit?: number;
      order?: AgentSoftwareOrder;
    },
  ) =>
    api.get<SoftwareInstallationsPage>(`${BASE}/${softwareId}/installations`, {
      scope: params?.scope,
      scopeId: params?.scopeId,
      cursor: params?.cursor,
      limit: params?.limit,
      order: params?.order,
    }),
};
