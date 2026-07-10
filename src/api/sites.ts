import { api } from "./client";
import type { Site, CreateSiteRequest, UpdateSiteRequest } from "./types";

export const sitesApi = {
  list: (clientId: string, includeInactive = false) =>
    api.get<Site[]>(`/api/v1/clients/${clientId}/sites`, { includeInactive }),

  get: (clientId: string, id: string) =>
    api.get<Site>(`/api/v1/clients/${clientId}/sites/${id}`),

  create: (clientId: string, data: CreateSiteRequest) =>
    api.post<Site>(`/api/v1/clients/${clientId}/sites`, data),

  update: (clientId: string, id: string, data: UpdateSiteRequest) =>
    api.put<Site>(`/api/v1/clients/${clientId}/sites/${id}`, data),

  delete: (clientId: string, id: string) =>
    api.del<void>(`/api/v1/clients/${clientId}/sites/${id}`),
};
