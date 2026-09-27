import { api } from "./client";

const BASE = "/api/v1/admin/database-sanitization";

export interface SanitizationCheckDescriptor {
  key: string;
  title: string;
  description: string;
}

export interface SanitizationCheckResult {
  key: string;
  title: string;
  scanned: number;
  fixed: number;
  skipped: number;
  error: string | null;
  samples: string[];
}

export interface SanitizationReport {
  startedAtUtc: string;
  finishedAtUtc: string;
  dryRun: boolean;
  totalScanned: number;
  totalFixed: number;
  checks: SanitizationCheckResult[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function normalizeCheck(raw: unknown): SanitizationCheckResult {
  const record = asRecord(raw);
  const error = record.error ?? record.Error;
  return {
    key: asString(record.key ?? record.Key),
    title: asString(record.title ?? record.Title),
    scanned: asNumber(record.scanned ?? record.Scanned),
    fixed: asNumber(record.fixed ?? record.Fixed),
    skipped: asNumber(record.skipped ?? record.Skipped),
    error: error === null || error === undefined ? null : asString(error),
    samples: asStringArray(record.samples ?? record.Samples),
  };
}

function normalizeReport(raw: unknown): SanitizationReport {
  const record = asRecord(raw);
  const rawChecks = record.checks ?? record.Checks;
  const checks = Array.isArray(rawChecks) ? rawChecks.map(normalizeCheck) : [];
  return {
    startedAtUtc: asString(record.startedAtUtc ?? record.StartedAtUtc),
    finishedAtUtc: asString(record.finishedAtUtc ?? record.FinishedAtUtc),
    dryRun: Boolean(record.dryRun ?? record.DryRun),
    totalScanned: asNumber(record.totalScanned ?? record.TotalScanned),
    totalFixed: asNumber(record.totalFixed ?? record.TotalFixed),
    checks,
  };
}

export const databaseSanitizationApi = {
  async checks(): Promise<SanitizationCheckDescriptor[]> {
    const raw = await api.get<unknown>(BASE + "/checks");
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
      const record = asRecord(item);
      return {
        key: asString(record.key ?? record.Key),
        title: asString(record.title ?? record.Title),
        description: asString(record.description ?? record.Description),
      };
    });
  },

  async run(payload: { dryRun: boolean; checks?: string[] }): Promise<SanitizationReport> {
    const raw = await api.post<unknown>(BASE + "/run", payload);
    return normalizeReport(raw);
  },
};
