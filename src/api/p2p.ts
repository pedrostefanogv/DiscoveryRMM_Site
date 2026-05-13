import { api } from "./client";
import type { CursorPageDto } from "./types";

export type P2PScope = "global" | "tenant" | "site" | "agent";

export interface P2PQueryScope {
  scope: P2PScope;
  tenantId?: string;
  siteId?: string;
  agentId?: string;
}

export interface P2POverviewParams extends P2PQueryScope {
  window?: string;
}

export interface P2POverviewResponse {
  scope: P2PScope | string;
  scopeId?: string | null;
  window: string;
  kpis: {
    activeAgents: number;
    activeSeeders: number;
    replicationSuccessRate: number;
    bytesServedDelta: number;
    bytesDownloadedDelta: number;
    queuePressure: number;
    artifactsWithPeers: number;
    lastTelemetryAtUtc?: string | null;
  };
  health: string;
  updatedAtUtc: string;
}

export interface P2PTimeseriesPoint {
  tsUtc: string;
  value: number;
}

export interface P2PTimeseriesResponse {
  metric: string;
  unit: string;
  points: P2PTimeseriesPoint[];
  summary: {
    min: number;
    max: number;
    avg: number;
    p95: number;
    total: number;
  };
}

export interface P2PArtifactsDistributionItem {
  artifactId: string;
  artifactName: string;
  peerCount: number;
  peerAgentIds?: string[];
  lastUpdatedUtc: string;
}

export interface P2PArtifactsDistributionResponse {
  total: number;
  limit: number;
  offset: number;
  items: P2PArtifactsDistributionItem[];
}

export type P2PDistributionPage = CursorPageDto<P2PArtifactsDistributionItem>;

export interface P2PArtifactsDistributionPageParams extends P2PQueryScope {
  artifactId?: string;
  cursor?: string;
  limit?: number;
}

export interface P2PAgentsRankingItem {
  agentId: string;
  siteId: string;
  clientId?: string | null;
  healthScore: number;
  replicationsStartedDelta: number;
  successRate: number;
  failureRate: number;
  bytesServedDelta: number;
  bytesDownloadedDelta: number;
  activeReplicationsAvg: number;
  queuedReplicationsAvg: number;
  lastTelemetryAtUtc?: string | null;
}

export interface P2PAgentsRankingParams {
  scope: P2PScope;
  tenantId?: string;
  siteId?: string;
  window?: string;
  sortBy?: string;
}

export type P2PAgentsRankingResponse = P2PAgentsRankingItem[];

export interface P2PSeedPlanItem {
  siteId?: string;
  totalAgents: number;
  configuredPercent: number;
  minSeeds: number;
  selectedSeeds: number;
  generatedAtUtc: string;
}

export type P2PSeedPlanResponse = P2PSeedPlanItem[];

export interface P2PTimeseriesParams extends P2PQueryScope {
  metric: string;
  interval?: string;
  from?: string;
  to?: string;
  fromUtc?: string;
  toUtc?: string;
}

export interface P2PArtifactsDistributionParams extends P2PQueryScope {
  artifactId?: string;
  limit?: number;
  offset?: number;
}

function toTimeseriesQuery(params: P2PTimeseriesParams) {
  const { from, fromUtc, to, toUtc, ...rest } = params;

  return {
    ...rest,
    from: from ?? fromUtc,
    to: to ?? toUtc,
  };
}

function withoutAgentId<T extends { agentId?: unknown }>(params: T): Omit<T, 'agentId'> {
  const { agentId: _agentId, ...rest } = params;
  return rest;
}

const BASE = "/api/v1/ops/p2p";

export const p2pApi = {
  getOverview: (params: P2POverviewParams) =>
    api.get<P2POverviewResponse>(
      `${BASE}/overview`,
      params as unknown as Record<string, unknown>,
    ),

  getTimeseries: (params: P2PTimeseriesParams) =>
    api.get<P2PTimeseriesResponse>(
      `${BASE}/timeseries`,
      toTimeseriesQuery(params) as unknown as Record<string, unknown>,
    ),

  getArtifactsDistribution: (params: P2PArtifactsDistributionParams) =>
    api.get<P2PArtifactsDistributionResponse>(
      `${BASE}/artifacts/distribution`,
      withoutAgentId(params) as unknown as Record<string, unknown>,
    ),

  getArtifactsDistributionPage: (params: P2PArtifactsDistributionPageParams) =>
    api.get<P2PDistributionPage>(
      `${BASE}/artifacts/distribution/page`,
      withoutAgentId(params) as unknown as Record<string, unknown>,
    ),

  getAgentsRanking: (params: P2PAgentsRankingParams) =>
    api.get<P2PAgentsRankingResponse>(
      `${BASE}/agents/ranking`,
      params as unknown as Record<string, unknown>,
    ),

  getSeedPlan: (params: P2PQueryScope) =>
    api.get<P2PSeedPlanResponse>(
      `${BASE}/seed-plan`,
      withoutAgentId(params) as unknown as Record<string, unknown>,
    ),
};
