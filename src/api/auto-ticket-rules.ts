import { api } from "./client";

const BASE = "/api/v1/auto-ticket-rules";

export const autoTicketRulesApi = {
  list: () => api.get<unknown[]>(BASE),

  get: (id: string) => api.get<unknown>(`${BASE}/${id}`),

  create: (data: unknown) => api.post<unknown>(BASE, data),

  update: (id: string, data: unknown) =>
    api.put<unknown>(`${BASE}/${id}`, data),

  enable: (id: string) =>
    api.patch<{ id: string; isEnabled: boolean }>(`${BASE}/${id}/enable`, {}),

  disable: (id: string) =>
    api.patch<{ id: string; isEnabled: boolean }>(`${BASE}/${id}/disable`, {}),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),

  dryRun: (id: string) => api.post<unknown>(`${BASE}/${id}/dry-run`),

  seedDefaults: () => api.post<unknown>(`${BASE}/seed-defaults`),

  getStats: (id: string) => api.get<unknown>(`${BASE}/${id}/stats`),
};
