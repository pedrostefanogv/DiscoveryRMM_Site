import { api } from "./client";
import type {
  Note,
  CreateNoteRequest,
  UpdateNoteRequest,
  CursorPageDto,
} from "./types";

const BASE = "/api/v1/notes";

export interface NotesPageParams {
  cursor?: string;
  limit?: number;
}

export const notesApi = {
  // ── Legacy (sem paginação) ──────────────────────────────

  listByClient: (clientId: string) =>
    api.get<Note[]>(`/api/v1/clients/${clientId}/notes`),

  listBySite: (siteId: string) =>
    api.get<Note[]>(`/api/v1/sites/${siteId}/notes`),

  listByAgent: (agentId: string) =>
    api.get<Note[]>(`/api/v1/agents/${agentId}/notes`),

  // ── Cursor pagination (NOVO) ─────────────────────────────

  listClientNotesPage: (clientId: string, params?: NotesPageParams) =>
    api.get<CursorPageDto<Note>>(
      `/api/v1/clients/${clientId}/notes/page`,
      params as Record<string, unknown>,
    ),

  listSiteNotesPage: (siteId: string, params?: NotesPageParams) =>
    api.get<CursorPageDto<Note>>(
      `/api/v1/sites/${siteId}/notes/page`,
      params as Record<string, unknown>,
    ),

  listAgentNotesPage: (agentId: string, params?: NotesPageParams) =>
    api.get<CursorPageDto<Note>>(
      `/api/v1/agents/${agentId}/notes/page`,
      params as Record<string, unknown>,
    ),

  listNotesPage: (
    params: NotesPageParams & {
      clientId?: string;
      siteId?: string;
      agentId?: string;
    },
  ) =>
    api.get<CursorPageDto<Note>>(
      `${BASE}/page`,
      params as Record<string, unknown>,
    ),

  // ── CRUD ──────────────────────────────────────────────────

  createForClient: (clientId: string, data: CreateNoteRequest) =>
    api.post<Note>(`/api/v1/clients/${clientId}/notes`, data),

  createForSite: (siteId: string, data: CreateNoteRequest) =>
    api.post<Note>(`/api/v1/sites/${siteId}/notes`, data),

  createForAgent: (agentId: string, data: CreateNoteRequest) =>
    api.post<Note>(`/api/v1/agents/${agentId}/notes`, data),

  get: (id: string) => api.get<Note>(`${BASE}/${id}`),

  update: (id: string, data: UpdateNoteRequest) =>
    api.put<Note>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};
