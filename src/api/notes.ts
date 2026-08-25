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

export interface NoteTarget {
  clientId?: string;
  siteId?: string;
  agentId?: string;
}

/**
 * O endpoint genérico `/api/v1/notes` resolve o alvo (client/site/agent)
 * pelos IDs passados na query (GET) ou no corpo (POST). A API valida a
 * permissão do alvo. Para agent também existem endpoints nested, mas aqui
 * usamos o genérico em todos para consistência.
 */
export const notesApi = {
  // ── Cursor pagination ─────────────────────────────────────

  listNotesPage: (
    target: NoteTarget &
      NotesPageParams & {
        clientId?: string;
        siteId?: string;
        agentId?: string;
      },
  ) =>
    api.get<CursorPageDto<Note>>(
      `${BASE}`,
      target as Record<string, unknown>,
    ),

  // ── CRUD ──────────────────────────────────────────────────

  create: (target: NoteTarget, data: CreateNoteRequest) =>
    api.post<Note>(BASE, { ...target, ...data }),

  get: (id: string) => api.get<Note>(`${BASE}/${id}`),

  update: (id: string, data: UpdateNoteRequest) =>
    api.put<Note>(`${BASE}/${id}`, data),

  delete: (id: string) => api.del<void>(`${BASE}/${id}`),
};
