import { api } from "./client";

const BASE = "/api/v1/admin/database-sanitization";

export interface SanitizationCheckDescriptor {
  key: string;
  title: string;
  description: string;
  /** Verificação apenas de relatório: nunca altera dados. */
  reportOnly: boolean;
}

export interface SanitizationCheckResult {
  key: string;
  title: string;
  /** Registros avaliados pela verificação. */
  examined: number;
  /** Inconsistências encontradas. */
  found: number;
  fixed: number;
  skipped: number;
  /** Varredura truncada pelo teto por verificação (há mais registros que os processados). */
  hasMore: boolean;
  error: string | null;
  samples: string[];
}

export interface SanitizationReport {
  startedAtUtc: string;
  finishedAtUtc: string;
  dryRun: boolean;
  totalExamined: number;
  totalFound: number;
  totalFixed: number;
  truncated: boolean;
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

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
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
    examined: asNumber(record.examined ?? record.Examined),
    found: asNumber(record.found ?? record.Found),
    fixed: asNumber(record.fixed ?? record.Fixed),
    skipped: asNumber(record.skipped ?? record.Skipped),
    hasMore: asBoolean(record.hasMore ?? record.HasMore),
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
    dryRun: asBoolean(record.dryRun ?? record.DryRun),
    totalExamined: asNumber(record.totalExamined ?? record.TotalExamined),
    totalFound: asNumber(record.totalFound ?? record.TotalFound),
    totalFixed: asNumber(record.totalFixed ?? record.TotalFixed),
    truncated: asBoolean(record.truncated ?? record.Truncated),
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
        reportOnly: asBoolean(record.reportOnly ?? record.ReportOnly),
      };
    });
  },

  async run(payload: { dryRun: boolean; checks?: string[] }): Promise<SanitizationReport> {
    const raw = await api.post<unknown>(BASE + "/run", payload, { timeoutMs: 0 });
    return normalizeReport(raw);
  },
};
