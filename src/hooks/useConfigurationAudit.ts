import type { ConfigurationEntityType } from "@/services/configurationApi";
import {
  configurationQueryKeys,
  useConfigurationAuditByUser,
  useConfigurationAuditReport as useConfigurationAuditReportQuery,
  useEntityConfigurationAudit,
  useFieldConfigurationAudit,
  useRecentConfigurationAudit,
} from "./useConfigurationApi";

export const auditKeys = {
  all: ["config", "audit"] as const,
  list: (query: { days?: number; limit?: number }) =>
    configurationQueryKeys.auditRecent(query.days ?? 30, query.limit ?? 200),
  byEntity: (entityType: string, entityId: string) =>
    configurationQueryKeys.auditEntity(
      entityType as ConfigurationEntityType,
      entityId,
    ),
  byField: (entityType: string, entityId: string, fieldName: string) =>
    configurationQueryKeys.auditField(
      entityType as ConfigurationEntityType,
      entityId,
      fieldName,
    ),
  byUser: (username: string) => configurationQueryKeys.auditByUser(username),
  report: (query: { startDate: string; endDate: string }) =>
    configurationQueryKeys.auditReport(query.startDate, query.endDate),
};

export function useConfigurationAudit(
  query: { days?: number; limit?: number } = {},
) {
  return useRecentConfigurationAudit(query.days ?? 30, query.limit ?? 200);
}

export function useConfigurationAuditByEntity(
  entityType: string,
  entityId: string,
) {
  return useEntityConfigurationAudit(
    entityType as ConfigurationEntityType,
    entityId,
  );
}

export function useConfigurationAuditByField(
  entityType: string,
  entityId: string,
  fieldName: string,
) {
  return useFieldConfigurationAudit(
    entityType as ConfigurationEntityType,
    entityId,
    fieldName,
  );
}

export { useConfigurationAuditByUser };

export function useConfigurationAuditReport(
  query: { startDate: string; endDate: string } | null,
) {
  return useConfigurationAuditReportQuery(
    query?.startDate ?? "",
    query?.endDate ?? "",
  );
}
