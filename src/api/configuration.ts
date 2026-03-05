import { api } from "./client";
import type {
  ClientConfiguration,
  ConfigurationMap,
  ConfigurationOrigin,
  EffectiveConfiguration,
  ServerConfiguration,
  SiteConfiguration,
} from "./types";

const BASE = "/api/configurations";

function normalizeEffective(payload: unknown): EffectiveConfiguration {
  if (!isRecord(payload)) {
    return { values: {}, origins: {} };
  }

  const candidateValues =
    payload.values ?? payload.configuration ?? payload.effective ?? payload;
  const candidateOrigins = payload.origins ?? payload.source ?? {};

  const values = isRecord(candidateValues)
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

  putServer: (data: ServerConfiguration) =>
    api.put<ServerConfiguration>(`${BASE}/server`, data),

  patchServer: (data: Partial<ServerConfiguration>) =>
    api.patch<ServerConfiguration>(`${BASE}/server`, data),

  resetServer: () => api.post<void>(`${BASE}/server/reset`),

  getClient: (clientId: string) =>
    api.get<ClientConfiguration>(`${BASE}/clients/${clientId}`),

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
