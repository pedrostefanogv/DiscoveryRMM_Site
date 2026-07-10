import { api } from "./client";
import type {
  AiCredentialQuery,
  AiModelQuery,
  AiModelScopeQuery,
  AiModelValidationRequest,
  AiProviderCredentialUpsertRequest,
  ClientConfiguration,
  ConfigurationMap,
  ConfigurationOrigin,
  EffectiveConfiguration,
  NatsConnectionTestRequest,
  NatsSettingsRequest,
  ServerRetentionSettings,
  ServerConfiguration,
  SiteConfiguration,
  TicketAttachmentSettings,
  TriggerMaintenanceRequest,
} from "./types";

const BASE = "/api/v1/configurations";
export type ServerReportingConfiguration = Record<string, unknown>;

function normalizeEffective(payload: unknown): EffectiveConfiguration {
  if (!isRecord(payload)) {
    return { values: {}, origins: {} };
  }

  // BUG-08: Valida explicitamente que candidateValues é um objeto plano antes de usá-lo.
  // Se candidateValues for null, array, ou não-objeto, usamos {} como fallback seguro.
  const candidateValues =
    payload.values ?? payload.configuration ?? payload.effective;
  const candidateOrigins = payload.origins ?? payload.source ?? {};

  const values =
    isRecord(candidateValues) && !Array.isArray(candidateValues)
      ? (candidateValues as ConfigurationMap)
      : {};

  const origins = isRecord(candidateOrigins)
    ? (candidateOrigins as Record<string, ConfigurationOrigin>)
    : {};

  return { values, origins };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export const configurationApi = {
  getServer: () => api.get<ServerConfiguration>(`${BASE}/server`),

  getServerMetadata: () =>
    api.get<Record<string, unknown>>(`${BASE}/server/metadata`),

  getServerReporting: () =>
    api.get<ServerReportingConfiguration>(`${BASE}/server/reporting`),

  putServer: (data: ServerConfiguration) =>
    api.put<ServerConfiguration>(`${BASE}/server`, data),

  putServerReporting: (data: ServerReportingConfiguration) =>
    api.put<ServerReportingConfiguration>(`${BASE}/server/reporting`, data),

  getServerRetention: () =>
    api.get<ServerRetentionSettings>(`${BASE}/server/retention`),

  putServerRetention: (data: ServerRetentionSettings) =>
    api.put<ServerRetentionSettings>(`${BASE}/server/retention`, data),

  resetServerRetention: () => api.post<void>(`${BASE}/server/retention/reset`),

  triggerServerRetention: (data: TriggerMaintenanceRequest) =>
    api.post<Record<string, unknown>>(`${BASE}/server/retention/trigger`, data),

  patchServer: (data: Partial<ServerConfiguration>) =>
    api.patch<ServerConfiguration>(`${BASE}/server`, data),

  resetServer: () => api.post<void>(`${BASE}/server/reset`),

  getTicketAttachmentSettings: () =>
    api.get<TicketAttachmentSettings>(`${BASE}/server/ticket-attachments`),

  putTicketAttachmentSettings: (data: TicketAttachmentSettings) =>
    api.put<TicketAttachmentSettings>(
      `${BASE}/server/ticket-attachments`,
      data,
    ),

  testObjectStorage: () =>
    api.post<{
      success: boolean;
      configurationValid: boolean;
      bucketReachable: boolean;
      errors: string[];
      latencyMs: number;
    }>(`${BASE}/server/object-storage/test`),
  testNatsServer: (payload: {
    url: string;
    user?: string;
    password?: string;
  }) =>
    api.post<{ ok: boolean; errors?: string[]; latencyMs?: number }>(
      `${BASE}/server/nats/test`,
      payload,
    ),
  patchServerNats: (data: NatsSettingsRequest) =>
    api.patch<ServerConfiguration>(`${BASE}/server/nats`, data),

  testNatsConnection: (payload?: NatsConnectionTestRequest) =>
    api.post<{ ok: boolean; errors?: string[]; latencyMs?: number }>(
      `${BASE}/server/nats/test`,
      payload,
    ),

  listAiCredentials: (params: AiCredentialQuery = {}) =>
    api.get<Array<Record<string, unknown>>>(
      `${BASE}/ai/credentials`,
      params as Record<string, unknown>,
    ),

  upsertAiCredential: (data: AiProviderCredentialUpsertRequest) =>
    api.put<Record<string, unknown>>(`${BASE}/ai/credentials`, data),

  deleteAiCredential: (credentialId: string) =>
    api.del<void>(`${BASE}/ai/credentials/${encodeURIComponent(credentialId)}`),

  testAiCredential: (data: AiProviderCredentialUpsertRequest) =>
    api.post<Record<string, unknown>>(`${BASE}/ai/credentials/test`, data),

  listAiProviders: () =>
    api.get<Array<Record<string, unknown>>>(`${BASE}/ai/providers`),

  listAiModels: (params: AiModelQuery = {}) =>
    api.get<Array<Record<string, unknown>>>(
      `${BASE}/ai/models`,
      params as Record<string, unknown>,
    ),

  getAiModel: (modelId: string, params: AiModelScopeQuery = {}) =>
    api.get<Record<string, unknown>>(
      `${BASE}/ai/models/${encodeURIComponent(modelId)}`,
      params as Record<string, unknown>,
    ),

  validateAiModel: (data: AiModelValidationRequest) =>
    api.post<Record<string, unknown>>(`${BASE}/ai/models/validate`, data),

  // ── Novos endpoints (Fases 1-4) ──
  listOpenRouterModels: (params?: { modality?: string; refresh?: boolean }) =>
    api.get<Record<string, unknown>>(
      `${BASE}/ai/openrouter/models`,
      params as Record<string, unknown>,
    ),

  validateApiKey: (data: {
    apiKey: string;
    provider?: string;
    baseUrl?: string;
  }) => api.post<Record<string, unknown>>(`${BASE}/ai/validate-key`, data),

  rerankDocuments: (data: {
    query: string;
    documents: string[];
    model?: string;
    topN?: number;
  }) => api.post<Record<string, unknown>>(`${BASE}/ai/rerank`, data),

  getRecommendedModels: () =>
    api.get<Record<string, unknown>>(`${BASE}/ai/recommended-models`),

  getClient: (clientId: string) =>
    api.get<ClientConfiguration>(`${BASE}/clients/${clientId}`),
  getClientMetadata: (clientId: string) =>
    api.get<Record<string, unknown>>(`${BASE}/clients/${clientId}/metadata`),

  getClientEffective: async (clientId: string) =>
    normalizeEffective(
      await api.get<unknown>(`${BASE}/clients/${clientId}/effective`),
    ),

  putClient: (clientId: string, data: ClientConfiguration) =>
    api.put<ClientConfiguration>(`${BASE}/clients/${clientId}`, data),

  patchClient: (clientId: string, data: Partial<ClientConfiguration>) =>
    api.patch<ClientConfiguration>(`${BASE}/clients/${clientId}`, data),

  deleteClient: (clientId: string) =>
    api.del<void>(`${BASE}/clients/${clientId}`),

  resetClientProperty: (clientId: string, propertyName: string) =>
    api.post<void>(
      `${BASE}/clients/${clientId}/reset/${encodeURIComponent(propertyName)}`,
    ),

  getSite: (siteId: string) =>
    api.get<SiteConfiguration>(`${BASE}/sites/${siteId}`),

  getSiteMetadata: (siteId: string) =>
    api.get<Record<string, unknown>>(`${BASE}/sites/${siteId}/metadata`),

  getSiteEffective: async (siteId: string) =>
    normalizeEffective(
      await api.get<unknown>(`${BASE}/sites/${siteId}/effective`),
    ),

  putSite: (siteId: string, data: SiteConfiguration) =>
    api.put<SiteConfiguration>(`${BASE}/sites/${siteId}`, data),

  patchSite: (siteId: string, data: Partial<SiteConfiguration>) =>
    api.patch<SiteConfiguration>(`${BASE}/sites/${siteId}`, data),

  deleteSite: (siteId: string) => api.del<void>(`${BASE}/sites/${siteId}`),

  resetSiteProperty: (siteId: string, propertyName: string) =>
    api.post<void>(
      `${BASE}/sites/${siteId}/reset/${encodeURIComponent(propertyName)}`,
    ),
};

/**
 * Extrai TicketAttachmentSettings de um JSON armazenado em ticketAttachmentSettingsJson
 * com fallback para defaults se nulo/inválido
 */
export function parseTicketAttachmentSettings(
  jsonValue: unknown,
): TicketAttachmentSettings {
  const parsed = parseJsonObject<TicketAttachmentSettings>(jsonValue);
  if (parsed) {
    return parsed;
  }
  // Fallback para defaults
  return {
    enabled: true,
    maxFileSizeBytes: 10485760, // 10 MB
    allowedContentTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ],
    presignedUploadUrlTtlMinutes: 15,
  };
}

/**
 * Extrai TicketAttachmentSettings de uma EffectiveConfiguration
 * Percorre a herança: Site → Client → Server
 */
export function extractTicketAttachmentSettingsFromEffective(
  effective: EffectiveConfiguration,
): TicketAttachmentSettings {
  const jsonValue = effective.values.ticketAttachmentSettingsJson;
  return parseTicketAttachmentSettings(jsonValue);
}

function parseJsonObject<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  return null;
}
