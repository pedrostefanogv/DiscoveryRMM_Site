import { api } from "./client";
import type { TicketKpiQuery, TicketKpiResult } from "./types";

const BASE = "/api/v1/tickets/kpi";

export const ticketKpiApi = {
  get: (params: TicketKpiQuery = {}) =>
    api.get<TicketKpiResult>(BASE, params as Record<string, unknown>),
};