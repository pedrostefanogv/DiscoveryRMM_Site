import { api } from "./client";

export type DashboardWindow = "24h" | "7d" | "30d";

export interface DashboardScopeDto {
  level: "global" | "client" | "site";
  clientId: string | null;
  siteId: string | null;
}

export interface DashboardPeriodDto {
  fromUtc: string;
  toUtc: string;
  windowHours: number;
}

export interface DashboardAgentsSummaryDto {
  total: number;
  online: number;
  offline: number;
  stale: number;
  maintenance: number;
  error: number;
  onlineGraceSeconds: number;
}

export interface DashboardCommandsSummaryDto {
  total: number;
  pending: number;
  sent: number;
  running: number;
  completed: number;
  failed: number;
  successRate: number;
}

export interface DashboardTicketsSummaryDto {
  total: number;
  open: number;
  closed: number;
  slaBreachedOpen: number;
}

export interface DashboardLogsSummaryDto {
  total: number;
  error: number;
  warn: number;
  info: number;
}

export interface DashboardAutomationSummaryDto {
  total: number;
  dispatched: number;
  acknowledged: number;
  completed: number;
  failed: number;
  successRate: number;
}

export interface DashboardSummaryDto {
  scope: DashboardScopeDto;
  period: DashboardPeriodDto;
  agents: DashboardAgentsSummaryDto;
  commands: DashboardCommandsSummaryDto;
  tickets: DashboardTicketsSummaryDto;
  logs: DashboardLogsSummaryDto;
  automation: DashboardAutomationSummaryDto;
  generatedAtUtc: string;
}

export const dashboardApi = {
  getGlobalSummary(window?: DashboardWindow): Promise<DashboardSummaryDto> {
    const params: Record<string, unknown> = {};
    if (window) params["window"] = window;
    return api.get<DashboardSummaryDto>(
      "/api/dashboard/global/summary",
      params,
    );
  },

  getClientSummary(
    clientId: string,
    window?: DashboardWindow,
  ): Promise<DashboardSummaryDto> {
    const params: Record<string, unknown> = {};
    if (window) params["window"] = window;
    return api.get<DashboardSummaryDto>(
      `/api/clients/${clientId}/dashboard/summary`,
      params,
    );
  },

  getSiteSummary(
    clientId: string,
    siteId: string,
    window?: DashboardWindow,
  ): Promise<DashboardSummaryDto> {
    const params: Record<string, unknown> = {};
    if (window) params["window"] = window;
    return api.get<DashboardSummaryDto>(
      `/api/clients/${clientId}/sites/${siteId}/dashboard/summary`,
      params,
    );
  },
};
