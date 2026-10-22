import { api } from "./client";

// ── Service Board (GET /api/v1/dashboard/service-board) ──────────────────

export type ServiceBoardItemKind = "ticket" | "automation" | "patch" | "alert";

export interface ServiceBoardCountsDto {
  ticket: number;
  automation: number;
  patch: number;
  alert: number;
}

export interface ServiceBoardItemDto {
  kind: ServiceBoardItemKind;
  id: string;
  title: string;
  status: string;
  priority: string | null;
  /** Idade em horas (fracionária) — a UI mostra "+3h" / "+2d". */
  ageHours: number;
  clientId?: string | null;
  clientName?: string | null;
  siteId?: string | null;
  deepLink: string;
}

export interface ServiceBoardDto {
  generatedAtUtc: string;
  counts: ServiceBoardCountsDto;
  items: ServiceBoardItemDto[];
}

export interface ServiceBoardParams {
  clientId?: string;
  siteId?: string;
  limit?: number;
}

export const serviceBoardApi = {
  get: (params: ServiceBoardParams = {}) =>
    api.get<ServiceBoardDto>("/api/v1/dashboard/service-board", {
      clientId: params.clientId,
      siteId: params.siteId,
      limit: params.limit,
    }),
};
