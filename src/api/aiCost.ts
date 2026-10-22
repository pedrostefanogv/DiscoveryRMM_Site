import { api } from "./client";

// ── Cockpit de custo IA (GET /api/v1/ai-cost/cockpit) ────────────────────

export interface AiCostTotalsDto {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiCostByClientDto {
  clientId: string;
  clientName: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** Orçamento mensal em USD — ausente quando o cliente não tem orçamento. */
  budgetUsdMonthly?: number | null;
}

export interface AiCostTopToolDto {
  tool: string;
  calls: number;
  costUsd: number;
}

export interface AiCostCockpitDto {
  fromUtc: string;
  toUtc: string;
  totals: AiCostTotalsDto;
  byClient: AiCostByClientDto[];
  topTools: AiCostTopToolDto[];
}

export interface AiCostCockpitParams {
  clientId?: string;
  /** Data (YYYY-MM-DD) — formatação ISO é responsabilidade do chamador. */
  from?: string;
  to?: string;
}

export const aiCostApi = {
  cockpit: (params: AiCostCockpitParams = {}) =>
    api.get<AiCostCockpitDto>("/api/v1/ai-cost/cockpit", {
      clientId: params.clientId,
      from: params.from,
      to: params.to,
    }),
};
