import { api } from "./client";
import type { Site, CreateSiteRequest, UpdateSiteRequest } from "./types";

export const sitesApi = {
  list: (clientId: string, includeInactive = false) =>
    api.get<Site[]>(`/api/v1/clients/${clientId}/Sites`, { includeInactive }),

  get: (clientId: string, id: string) =>
    api.get<Site>(`/api/v1/clients/${clientId}/Sites/${id}`),

  create: (clientId: string, data: CreateSiteRequest) =>
    api.post<Site>(`/api/v1/clients/${clientId}/Sites`, data),

  update: (clientId: string, id: string, data: UpdateSiteRequest) =>
    api.put<Site>(`/api/v1/clients/${clientId}/Sites/${id}`, data),

  delete: (clientId: string, id: string) =>
    api.del<void>(`/api/v1/clients/${clientId}/Sites/${id}`),
};
