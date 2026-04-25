import { api } from "./client";
import type {
  ConfigurationAuditEntry,
  ConfigurationAuditQuery,
  ConfigurationAuditReportQuery,
} from "./types";

const BASE = "/api/configuration-audit";

export const auditApi = {
  list: (query: ConfigurationAuditQuery = {}) =>
    api.get<ConfigurationAuditEntry[]>(BASE, { ...query }),

  byEntity: (entityType: string, entityId: string) =>
    api.get<ConfigurationAuditEntry[]>(
      `${BASE}/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    ),

  byField: (entityType: string, entityId: string, fieldName: string) =>
    api.get<ConfigurationAuditEntry[]>(
      `${BASE}/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/field/${encodeURIComponent(fieldName)}`,
    ),

  byUser: (username: string) =>
    api.get<ConfigurationAuditEntry[]>(
      `${BASE}/by-user/${encodeURIComponent(username)}`,
    ),

  report: (query: ConfigurationAuditReportQuery) =>
    api.get<ConfigurationAuditEntry[]>(`${BASE}/report`, { ...query }),
};
