import { api } from "./client";

// ── Patch Compliance (GET /api/v1/patches/compliance) ────────────────────

export interface PatchComplianceScopeDto {
  clientId: string | null;
  siteId: string | null;
}

export interface PatchComplianceTotalsDto {
  agents: number;
  compliant: number;
  score: number;
  pendingPatches: number;
  failedPatches: number;
}

export interface PatchComplianceRowDto {
  clientId: string;
  clientName: string;
  siteId?: string | null;
  siteName?: string | null;
  agents: number;
  compliant: number;
  score: number;
  pendingPatches: number;
  failedPatches: number;
  lastScanUtc?: string | null;
}

export interface PatchComplianceDto {
  generatedAtUtc: string;
  scope: PatchComplianceScopeDto;
  totals: PatchComplianceTotalsDto;
  rows: PatchComplianceRowDto[];
}

export interface PatchComplianceParams {
  clientId?: string;
  siteId?: string;
}

export const patchComplianceApi = {
  get: (params: PatchComplianceParams = {}) =>
    api.get<PatchComplianceDto>("/api/v1/patches/compliance", {
      clientId: params.clientId,
      siteId: params.siteId,
    }),
};
