import { api } from "@/api/client";
import type {
  AiCredentialQuery,
  AiModelQuery,
  AiModelScopeQuery,
  AiModelValidationRequest,
  AIIntegrationSettings,
  AiProviderCredentialUpsertRequest,
  AutoUpdateSettings,
  BrandingSettings,
  ClientConfiguration,
  ConfigurationAuditEntry,
  ConfigurationAuditReportQuery,
  ConfigurationMetadataResponse,
  ConfigurationFieldMetadata,
  NatsSettingsRequest,
  ReportingSettings,
  ResolvedConfiguration,
  ServerRetentionSettings,
  ServerConfiguration,
  SiteConfiguration,
  TicketAttachmentSettings,
  TriggerMaintenanceRequest,
} from "@/api/types";

const CONFIG_BASE = "/api/v1/configurations";
const AUDIT_BASE = "/api/v1/configuration-audit";

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
export type ServerReportingConfiguration = Record<string, unknown>;

const CANONICAL_CONFIGURATION_FIELDS: Record<string, string> = {
  // Aceita aliases legados e normaliza para o formato camelCase do contrato atual.
  aiIntegrationSettingsJson: "aiIntegrationSettingsJson",
  AiIntegrationSettingsJson: "aiIntegrationSettingsJson",
  AIIntegrationSettingsJson: "aiIntegrationSettingsJson",
};

function toCanonicalConfigurationFieldName(fieldName: string): string {
  if (!fieldName) {
    return fieldName;
  }

  const known = CANONICAL_CONFIGURATION_FIELDS[fieldName];
  if (known) {
    return known;
  }

  // Mantem o nome recebido para preservar o contrato de payload em camelCase.
  return fieldName;
}

function toCanonicalConfigurationPayload<T extends Record<string, unknown>>(
  payload: T,
): Record<string, unknown> {
  const nextPayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    nextPayload[toCanonicalConfigurationFieldName(key)] = value;
  }
  return nextPayload;
}

function normalizeMetadata(payload: unknown): ConfigurationMetadataResponse {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { fields: {} };
  }

  const record = payload as Record<string, unknown>;
  const fieldsCandidate =
    record.fields &&
    typeof record.fields === "object" &&
    !Array.isArray(record.fields)
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

function parseJsonObject<T>(jsonValue: string | null | undefined): T | null {
  if (!jsonValue) {
    return null;
  }

  try {
    return JSON.parse(jsonValue) as T;
  } catch {
    return null;
  }
}

export function parseAutoUpdateSettings(
  jsonValue: string | null | undefined,
): AutoUpdateSettings | null {
  return parseJsonObject<AutoUpdateSettings>(jsonValue);
}

export function parseAIIntegrationSettings(
  jsonValue: string | null | undefined,
): AIIntegrationSettings | null {
  const parsed = parseJsonObject<AIIntegrationSettings>(jsonValue);

  if (!parsed) {
    return null;
  }

  const sanitized = { ...parsed };
  if ("apiKey" in sanitized) {
    delete sanitized.apiKey;
  }
  if ("embeddingApiKey" in sanitized) {
    delete sanitized.embeddingApiKey;
  }

  return sanitized;
}

export function parseBrandingSettings(
  jsonValue: string | null | undefined,
): BrandingSettings | null {
  return parseJsonObject<BrandingSettings>(jsonValue);
}

export function parseReportingSettings(
  jsonValue: string | null | undefined,
): ReportingSettings | null {
  return parseJsonObject<ReportingSettings>(jsonValue);
}

export function parseTicketAttachmentSettingsJson(
  jsonValue: string | null | undefined,
): TicketAttachmentSettings | null {
  return parseJsonObject<TicketAttachmentSettings>(jsonValue);
}

export function stringifyConfigurationJson(
  value: Record<string, unknown> | null | undefined,
): string {
  if (!value) {
    return "{}";
  }

  return JSON.stringify(value);
}

export function getServerConfig() {
  return api.get<ServerConfiguration>(`${CONFIG_BASE}/server`);
}

export function updateServerConfig(payload: ServerConfigurationPayload) {
  return api.put<ServerConfiguration>(
    `${CONFIG_BASE}/server`,
    toCanonicalConfigurationPayload(payload as Record<string, unknown>),
  );
}

export function patchServerConfig(partialPayload: ServerConfigurationPayload) {
  return api.patch<ServerConfiguration>(
    `${CONFIG_BASE}/server`,
    toCanonicalConfigurationPayload(partialPayload as Record<string, unknown>),
  );
}

export function patchServerNatsConfig(payload: NatsSettingsRequest) {
  return api.patch<ServerConfiguration>(
    `${CONFIG_BASE}/server/nats`,
    payload as Record<string, unknown>,
  );
}

export function resetServerConfig() {
  return api.post<void>(`${CONFIG_BASE}/server/reset`);
}

export async function getServerMetadata() {
  return normalizeMetadata(
    await api.get<unknown>(`${CONFIG_BASE}/server/metadata`),
  );
}

export function getServerReportingConfig() {
  return api.get<ServerReportingConfiguration>(
    `${CONFIG_BASE}/server/reporting`,
  );
}

export function getServerRetentionConfig() {
  return api.get<ServerRetentionSettings>(`${CONFIG_BASE}/server/retention`);
}

export function updateServerRetentionConfig(payload: ServerRetentionSettings) {
  return api.put<ServerRetentionSettings>(`${CONFIG_BASE}/server/retention`, payload);
}

export function resetServerRetentionConfig() {
  return api.post<void>(`${CONFIG_BASE}/server/retention/reset`);
}

export function triggerServerRetentionMaintenance(
  payload: TriggerMaintenanceRequest,
) {
  return api.post<Record<string, unknown>>(
    `${CONFIG_BASE}/server/retention/trigger`,
    payload,
  );
}

export function updateServerReportingConfig(
  payload: ServerReportingConfiguration,
) {
  return api.put<ServerReportingConfiguration>(
    `${CONFIG_BASE}/server/reporting`,
    payload,
  );
}

export function getClientConfig(clientId: string) {
  return api.get<ClientConfiguration>(`${CONFIG_BASE}/clients/${clientId}`);
}

export function listAiCredentials(params: AiCredentialQuery = {}) {
  return api.get<Array<Record<string, unknown>>>(
    `${CONFIG_BASE}/ai/credentials`,
    params as Record<string, unknown>,
  );
}

export function upsertAiCredential(payload: AiProviderCredentialUpsertRequest) {
  return api.put<Record<string, unknown>>(`${CONFIG_BASE}/ai/credentials`, payload);
}

export function deleteAiCredential(credentialId: string) {
  return api.del<void>(`${CONFIG_BASE}/ai/credentials/${encodeURIComponent(credentialId)}`);
}

export function testAiCredential(payload: AiProviderCredentialUpsertRequest) {
  return api.post<Record<string, unknown>>(`${CONFIG_BASE}/ai/credentials/test`, payload);
}

export function listAiProviders() {
  return api.get<Array<Record<string, unknown>>>(`${CONFIG_BASE}/ai/providers`);
}

export function listAiModels(params: AiModelQuery = {}) {
  return api.get<Array<Record<string, unknown>>>(
    `${CONFIG_BASE}/ai/models`,
    params as Record<string, unknown>,
  );
}

export function getAiModel(modelId: string, params: AiModelScopeQuery = {}) {
  return api.get<Record<string, unknown>>(
    `${CONFIG_BASE}/ai/models/${encodeURIComponent(modelId)}`,
    params as Record<string, unknown>,
  );
}

export function validateAiModel(payload: AiModelValidationRequest) {
  return api.post<Record<string, unknown>>(`${CONFIG_BASE}/ai/models/validate`, payload);
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
    toCanonicalConfigurationPayload(payload as Record<string, unknown>),
  );
}

export function patchClientConfig(
  clientId: string,
  partialPayload: ClientConfigurationPayload,
) {
  return api.patch<ClientConfiguration>(
    `${CONFIG_BASE}/clients/${clientId}`,
    toCanonicalConfigurationPayload(partialPayload as Record<string, unknown>),
  );
}

export function deleteClientConfig(clientId: string) {
  return api.del<void>(`${CONFIG_BASE}/clients/${clientId}`);
}

export function resetClientProperty(clientId: string, propertyName: string) {
  return api.post<void>(
    `${CONFIG_BASE}/clients/${clientId}/reset/${encodeURIComponent(toCanonicalConfigurationFieldName(propertyName))}`,
  );
}

export async function getClientMetadata(clientId: string) {
  return normalizeMetadata(
    await api.get<unknown>(`${CONFIG_BASE}/clients/${clientId}/metadata`),
  );
}

export function getSiteConfig(siteId: string) {
  return api.get<SiteConfiguration>(`${CONFIG_BASE}/sites/${siteId}`);
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
  return api.put<SiteConfiguration>(
    `${CONFIG_BASE}/sites/${siteId}`,
    toCanonicalConfigurationPayload(payload as Record<string, unknown>),
  );
}

export function patchSiteConfig(
  siteId: string,
  partialPayload: SiteConfigurationPayload,
) {
  return api.patch<SiteConfiguration>(
    `${CONFIG_BASE}/sites/${siteId}`,
    toCanonicalConfigurationPayload(partialPayload as Record<string, unknown>),
  );
}

export function deleteSiteConfig(siteId: string) {
  return api.del<void>(`${CONFIG_BASE}/sites/${siteId}`);
}

export function resetSiteProperty(siteId: string, propertyName: string) {
  return api.post<void>(
    `${CONFIG_BASE}/sites/${siteId}/reset/${encodeURIComponent(toCanonicalConfigurationFieldName(propertyName))}`,
  );
}

export async function getSiteMetadata(siteId: string) {
  return normalizeMetadata(
    await api.get<unknown>(`${CONFIG_BASE}/sites/${siteId}/metadata`),
  );
}

export function getAgentMeEffectiveConfig() {
  return api.get<ResolvedConfiguration>("/api/v1/agent-auth/me/configuration");
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
