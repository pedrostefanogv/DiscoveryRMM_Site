import { api } from "@/api/client";
import type {
  ClientConfiguration,
  ConfigurationAuditEntry,
  ConfigurationAuditReportQuery,
  ConfigurationMetadataResponse,
  ConfigurationFieldMetadata,
  ResolvedConfiguration,
  ServerConfiguration,
  SiteConfiguration,
} from "@/api/types";

const CONFIG_BASE = "/api/configurations";
const AUDIT_BASE = "/api/configuration-audit";

export type ServerConfigurationPayload = Partial<
  Omit<
    ServerConfiguration,
    "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "version"
  >
>;

export type ClientConfigurationPayload = Partial<
  Omit<
    ClientConfiguration,
    | "id"
    | "clientId"
    | "createdAt"
    | "updatedAt"
    | "createdBy"
    | "updatedBy"
    | "version"
  >
>;

export type SiteConfigurationPayload = Partial<
  Omit<
    SiteConfiguration,
    | "id"
    | "siteId"
    | "clientId"
    | "createdAt"
    | "updatedAt"
    | "createdBy"
    | "updatedBy"
    | "version"
  >
>;

export type ConfigurationEntityType = "Server" | "Client" | "Site";

function normalizeMetadata(payload: unknown): ConfigurationMetadataResponse {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { fields: {} };
  }

  const record = payload as Record<string, unknown>;
  const fieldsCandidate =
    record.fields && typeof record.fields === "object" && !Array.isArray(record.fields)
      ? (record.fields as Record<string, unknown>)
      : record;

  const fields: Record<string, ConfigurationFieldMetadata> = {};
  for (const [key, value] of Object.entries(fieldsCandidate)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      fields[key] = value as ConfigurationFieldMetadata;
    }
  }

  const blockedFields = Array.isArray(record.blockedFields)
    ? (record.blockedFields as string[])
    : undefined;

  return { fields, blockedFields };
}

export function getServerConfig() {
  return api.get<ServerConfiguration>(`${CONFIG_BASE}/server`);
}

export function updateServerConfig(payload: ServerConfigurationPayload) {
  return api.put<ServerConfiguration>(`${CONFIG_BASE}/server`, payload);
}

export function patchServerConfig(partialPayload: ServerConfigurationPayload) {
  return api.patch<ServerConfiguration>(
    `${CONFIG_BASE}/server`,
    partialPayload,
  );
}

export function resetServerConfig() {
  return api.post<void>(`${CONFIG_BASE}/server/reset`);
}

export async function getServerMetadata() {
  return normalizeMetadata(await api.get<unknown>(`${CONFIG_BASE}/server/metadata`));
}

export function getClientConfig(clientId: string) {
  return api.get<ClientConfiguration>(`${CONFIG_BASE}/clients/${clientId}`);
}

export function getClientEffectiveConfig(clientId: string) {
  return api.get<ResolvedConfiguration>(
    `${CONFIG_BASE}/clients/${clientId}/effective`,
  );
}

export function upsertClientConfig(
  clientId: string,
  payload: ClientConfigurationPayload,
) {
  return api.put<ClientConfiguration>(
    `${CONFIG_BASE}/clients/${clientId}`,
    payload,
  );
}

export function patchClientConfig(
  clientId: string,
  partialPayload: ClientConfigurationPayload,
) {
  return api.patch<ClientConfiguration>(
    `${CONFIG_BASE}/clients/${clientId}`,
    partialPayload,
  );
}

export function deleteClientConfig(clientId: string) {
  return api.del<void>(`${CONFIG_BASE}/clients/${clientId}`);
}

export function resetClientProperty(clientId: string, propertyName: string) {
  return api.post<void>(
    `${CONFIG_BASE}/clients/${clientId}/reset/${encodeURIComponent(propertyName)}`,
  );
}

export async function getClientMetadata(clientId: string) {
  return normalizeMetadata(
    await api.get<unknown>(`${CONFIG_BASE}/clients/${clientId}/metadata`),
  );
}

export function getSiteConfig(siteId: string) {
  return api.get<ResolvedConfiguration>(`${CONFIG_BASE}/sites/${siteId}`);
}

export function getSiteEffectiveConfig(siteId: string) {
  return api.get<ResolvedConfiguration>(
    `${CONFIG_BASE}/sites/${siteId}/effective`,
  );
}

export function upsertSiteConfig(
  siteId: string,
  payload: SiteConfigurationPayload,
) {
  return api.put<SiteConfiguration>(`${CONFIG_BASE}/sites/${siteId}`, payload);
}

export function patchSiteConfig(
  siteId: string,
  partialPayload: SiteConfigurationPayload,
) {
  return api.patch<SiteConfiguration>(
    `${CONFIG_BASE}/sites/${siteId}`,
    partialPayload,
  );
}

export function deleteSiteConfig(siteId: string) {
  return api.del<void>(`${CONFIG_BASE}/sites/${siteId}`);
}

export function resetSiteProperty(siteId: string, propertyName: string) {
  return api.post<void>(
    `${CONFIG_BASE}/sites/${siteId}/reset/${encodeURIComponent(propertyName)}`,
  );
}

export async function getSiteMetadata(siteId: string) {
  return normalizeMetadata(
    await api.get<unknown>(`${CONFIG_BASE}/sites/${siteId}/metadata`),
  );
}

export function getAgentMeEffectiveConfig() {
  return api.get<ResolvedConfiguration>("/api/agent-auth/me/configuration");
}

export function getRecentAudit(days = 30, limit = 200) {
  return api.get<ConfigurationAuditEntry[]>(AUDIT_BASE, { days, limit });
}

export function getEntityAudit(
  entityType: ConfigurationEntityType,
  entityId: string,
  limit?: number,
) {
  return api.get<ConfigurationAuditEntry[]>(
    `${AUDIT_BASE}/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
    { limit },
  );
}

export function getFieldAudit(
  entityType: ConfigurationEntityType,
  entityId: string,
  fieldName: string,
) {
  return api.get<ConfigurationAuditEntry[]>(
    `${AUDIT_BASE}/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/field/${encodeURIComponent(fieldName)}`,
  );
}

export function getAuditByUser(username: string, limit?: number) {
  return api.get<ConfigurationAuditEntry[]>(
    `${AUDIT_BASE}/by-user/${encodeURIComponent(username)}`,
    { limit },
  );
}

export function getAuditReport(startDate: string, endDate: string) {
  const query: ConfigurationAuditReportQuery = { startDate, endDate };
  return api.get<ConfigurationAuditEntry[]>(`${AUDIT_BASE}/report`, {
    ...query,
  });
}
