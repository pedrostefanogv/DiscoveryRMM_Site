import { api } from "./client";

// ── Macros (respostas rápidas) ───────────────────────────────────────────

export interface TicketMacroDto {
  id: string;
  clientId: string | null;
  departmentId: string | null;
  name: string;
  description: string | null;
  content: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTicketMacroRequest {
  clientId: string | null;
  departmentId: string | null;
  name: string;
  description: string | null;
  content: string;
  isActive: boolean;
}

// ── Templates de chamado ─────────────────────────────────────────────────

export interface TicketTemplateDto {
  id: string;
  /**
   * ATENÇÃO: a API serializa com JsonIgnoreCondition.WhenWritingNull, então
   * escopo global vem como propriedade AUSENTE (undefined) — trate com
   * `?? null` ou checagem de veracidade, nunca com `=== null`.
   */
  clientId?: string | null;
  departmentId?: string | null;
  name: string;
  title: string;
  description: string;
  priority: string | null;
  category: string | null;
  customFieldDefaultsJson: string;
  questionsJson: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Soft delete. ATENÇÃO: a API serializa com JsonIgnoreCondition.WhenWritingNull,
   * então estes campos ficam AUSENTES (undefined) quando não há exclusão — nunca
   * compare com null; use sempre checagem de veracidade (Boolean(deletedAt)).
   */
  deletedAt?: string | null;
  deletedBy?: string | null;
}

/**
 * Escopo da listagem de templates. A página de administração usa os flags
 * amplos (includeInactive/includeDeleted/allClients).
 *
 * Declarado como type alias (e não interface) para ganhar index signature
 * implícita e poder alimentar as APIs que recebem Record<string, unknown>.
 */
export type TicketTemplateListParams = {
  clientId?: string;
  departmentId?: string;
  includeGlobal?: boolean;
  includeInactive?: boolean;
  includeDeleted?: boolean;
  allClients?: boolean;
};

export interface UpsertTicketTemplateRequest {
  clientId: string | null;
  departmentId: string | null;
  name: string;
  title: string;
  description: string;
  priority: string | null;
  category: string | null;
  customFieldDefaultsJson: string;
  questionsJson: string;
  isActive: boolean;
}

// ── Canais de notificação ────────────────────────────────────────────────

export interface NotificationChannelDto {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  eventsJson: string;
  configJson: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertNotificationChannelRequest {
  name: string;
  type: string;
  isActive: boolean;
  eventsJson: string;
  configJson: string;
}

// ── Membros de departamento ──────────────────────────────────────────────

export interface DepartmentMemberDto {
  id: string;
  departmentId: string;
  userId: string;
  userName: string | null;
  isActive: boolean;
  createdAt: string;
}

// ── CSAT ─────────────────────────────────────────────────────────────────

export interface TicketCsatGroupDto {
  id: string | null;
  label: string;
  count: number;
  average: number;
}

export interface TicketCsatSummaryDto {
  total: number;
  rated: number;
  average: number;
  distribution: Record<string, number>;
  byDepartment: TicketCsatGroupDto[];
  byTechnician: TicketCsatGroupDto[];
}

const MACROS = "/api/v1/ticket-macros";
const TEMPLATES = "/api/v1/ticket-templates";
const CHANNELS = "/api/v1/notification-channels";
const TICKETS = "/api/v1/tickets";
const DEPARTMENTS = "/api/v1/departments";

export const ticketMacrosApi = {
  list: (params: { clientId?: string; departmentId?: string; includeGlobal?: boolean } = {}) =>
    api.get<TicketMacroDto[]>(MACROS, params as Record<string, unknown>),
  create: (data: UpsertTicketMacroRequest) => api.post<TicketMacroDto>(MACROS, data),
  update: (id: string, data: UpsertTicketMacroRequest) => api.put<TicketMacroDto>(`${MACROS}/${id}`, data),
  remove: (id: string) => api.del<void>(`${MACROS}/${id}`),
};

export const ticketTemplatesApi = {
  list: (params: TicketTemplateListParams = {}) =>
    api.get<TicketTemplateDto[]>(TEMPLATES, params as Record<string, unknown>),
  create: (data: UpsertTicketTemplateRequest) => api.post<TicketTemplateDto>(TEMPLATES, data),
  update: (id: string, data: UpsertTicketTemplateRequest) => api.put<TicketTemplateDto>(`${TEMPLATES}/${id}`, data),
  /** Soft delete: o template vai para a lixeira e pode ser restaurado. */
  remove: (id: string) => api.del<void>(`${TEMPLATES}/${id}`),
  /** Exclusão física. permanent + force confirma template já usado por chamados. */
  purge: (id: string, force = false) =>
    api.del<void>(`${TEMPLATES}/${id}?permanent=true${force ? "&force=true" : ""}`),
  restore: (id: string) => api.post<void>(`${TEMPLATES}/${id}/restore`),
};

export const notificationChannelsApi = {
  list: () => api.get<NotificationChannelDto[]>(CHANNELS),
  create: (data: UpsertNotificationChannelRequest) => api.post<NotificationChannelDto>(CHANNELS, data),
  update: (id: string, data: UpsertNotificationChannelRequest) => api.put<NotificationChannelDto>(`${CHANNELS}/${id}`, data),
  remove: (id: string) => api.del<void>(`${CHANNELS}/${id}`),
};

export const departmentMembersApi = {
  list: (departmentId: string) => api.get<DepartmentMemberDto[]>(`${DEPARTMENTS}/${departmentId}/members`),
  add: (departmentId: string, userId: string) =>
    api.post<DepartmentMemberDto>(`${DEPARTMENTS}/${departmentId}/members`, { userId }),
  remove: (departmentId: string, userId: string) =>
    api.del<void>(`${DEPARTMENTS}/${departmentId}/members/${userId}`),
};

export const ticketCsatApi = {
  summary: (params: { from?: string; to?: string; clientId?: string; departmentId?: string } = {}) =>
    api.get<TicketCsatSummaryDto>(`${TICKETS}/csat/summary`, params as Record<string, unknown>),
};
