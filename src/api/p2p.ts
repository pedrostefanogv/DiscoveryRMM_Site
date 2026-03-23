import { api } from "./client";

export type P2PScope = "global" | "tenant" | "site" | "agent";

export interface P2PQueryScope {
  scope: P2PScope;
  tenantId?: string;
  siteId?: string;
  agentId?: string;
}

export interface P2POverviewResponse {
  activeAgents: number;
  seeders: number;
  successRate: number;
  bytesTransferred: number;
  healthScore: number;
}

export interface P2PTimeseriesPoint {
  timestampUtc: string;
  value: number;
}

export interface P2PTimeseriesResponse {
  metric: string;
  interval: string;
  points: P2PTimeseriesPoint[];
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

export interface P2PAgentsRankingItem {
  agentId: string;
  agentName: string;
  healthScore: number;
  bytesTransferred: number;
  failureRate: number;
  queueLength: number;
}

export interface P2PAgentsRankingResponse {
  total: number;
  limit: number;
  offset: number;
  items: P2PAgentsRankingItem[];
}

export interface P2PSeedPlanItem {
  scope: P2PScope;
  tenantId?: string;
  siteId?: string;
  desiredSeeders: number;
  actualSeeders: number;
  status: string;
  updatedUtc?: string;
}

export interface P2PSeedPlanResponse {
  items: P2PSeedPlanItem[];
}

export interface P2PTimeseriesParams extends P2PQueryScope {
  metric: string;
  interval?: string;
  fromUtc?: string;
  toUtc?: string;
}

export interface P2PPagedParams extends P2PQueryScope {
  limit?: number;
  offset?: number;
}

const BASE = "/api/ops/p2p";

export const p2pApi = {
  getOverview: (params: P2PQueryScope) =>
    api.get<P2POverviewResponse>(`${BASE}/overview`, params as unknown as Record<string, unknown>),

  getTimeseries: (params: P2PTimeseriesParams) =>
    api.get<P2PTimeseriesResponse>(`${BASE}/timeseries`, params as unknown as Record<string, unknown>),

  getArtifactsDistribution: (params: P2PPagedParams) =>
    api.get<P2PArtifactsDistributionResponse>(
      `${BASE}/artifacts/distribution`,
      params as unknown as Record<string, unknown>,
    ),

  getAgentsRanking: (params: P2PPagedParams) =>
    api.get<P2PAgentsRankingResponse>(`${BASE}/agents/ranking`, params as unknown as Record<string, unknown>),

  getSeedPlan: (params: P2PQueryScope) =>
    api.get<P2PSeedPlanResponse>(`${BASE}/seed-plan`, params as unknown as Record<string, unknown>),
};
