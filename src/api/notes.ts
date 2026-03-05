import { api } from "./client";
import type { Note, CreateNoteRequest, UpdateNoteRequest } from "./types";

const BASE = "/api/notes";

export const notesApi = {
  listByClient: (clientId: string) =>
    api.get<Note[]>(`/api/clients/${clientId}/notes`),

  createForClient: (clientId: string, data: CreateNoteRequest) =>
    api.post<Note>(`/api/clients/${clientId}/notes`, data),

  listBySite: (siteId: string) => api.get<Note[]>(`/api/sites/${siteId}/notes`),

  createForSite: (siteId: string, data: CreateNoteRequest) =>
    api.post<Note>(`/api/sites/${siteId}/notes`, data),

  listByAgent: (agentId: string) =>
    api.get<Note[]>(`/api/agents/${agentId}/notes`),

  createForAgent: (agentId: string, data: CreateNoteRequest) =>
    api.post<Note>(`/api/agents/${agentId}/notes`, data),

  get: (id: string) => api.get<Note>(`${BASE}/${id}`),

  update: (id: string, data: UpdateNoteRequest) =>
    api.put<Note>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};
