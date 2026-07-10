import { api } from "./client";
import type { Client, CreateClientRequest, UpdateClientRequest } from "./types";

const BASE = "/api/v1/clients";

export const clientsApi = {
  list: (includeInactive = false) =>
    api.get<Client[]>(BASE, { includeInactive }),

  get: (id: string) => api.get<Client>(`${BASE}/${id}`),

  create: (data: CreateClientRequest) => api.post<Client>(BASE, data),

  update: (id: string, data: UpdateClientRequest) =>
    api.put<Client>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};
