import { api } from "./client";

const BASE = "/api/v1/admin/database-maintenance";

export interface DatabaseTableStat {
  table: string;
  totalBytes: number;
  liveTuples: number;
  deadTuples: number;
  deadPercent: number;
  lastVacuumUtc: string | null;
  lastAutovacuumUtc: string | null;
  lastAnalyzeUtc: string | null;
  xidAge: number;
}

export type DatabaseHealthSeverity = "critical" | "warning" | "info";

export interface DatabaseHealthIssue {
  key: string;
  title: string;
  severity: DatabaseHealthSeverity;
  count: number;
  samples: string[];
}

export interface DatabaseHealthReport {
  generatedAtUtc: string;
  databaseSizeBytes: number;
  totalTableSizeBytes: number;
  tables: DatabaseTableStat[];
  issues: DatabaseHealthIssue[];
}

export interface DatabaseMaintenanceRun {
  id: string;
  startedAtUtc: string;
  finishedAtUtc: string;
  succeeded: boolean;
  tableCount: number;
  successCount: number;
  errorCount: number;
  databaseSizeBytes: number;
  reclaimedBytes: number;
  errorMessage: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text.length > 0 ? text : null;
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

function normalizeSeverity(value: unknown): DatabaseHealthSeverity {
  const normalized = asString(value).trim().toLowerCase();
  if (normalized === "critical" || normalized === "warning") return normalized;
  return "info";
}

function normalizeTableStat(raw: unknown): DatabaseTableStat {
  const record = asRecord(raw);
  return {
    table: asString(record.table ?? record.Table),
    totalBytes: asNumber(record.totalBytes ?? record.TotalBytes),
    liveTuples: asNumber(record.liveTuples ?? record.LiveTuples),
    deadTuples: asNumber(record.deadTuples ?? record.DeadTuples),
    deadPercent: asNumber(record.deadPercent ?? record.DeadPercent),
    lastVacuumUtc: asNullableString(record.lastVacuumUtc ?? record.LastVacuumUtc),
    lastAutovacuumUtc: asNullableString(record.lastAutovacuumUtc ?? record.LastAutovacuumUtc),
    lastAnalyzeUtc: asNullableString(record.lastAnalyzeUtc ?? record.LastAnalyzeUtc),
    xidAge: asNumber(record.xidAge ?? record.XidAge),
  };
}

function normalizeIssue(raw: unknown): DatabaseHealthIssue {
  const record = asRecord(raw);
  return {
    key: asString(record.key ?? record.Key),
    title: asString(record.title ?? record.Title),
    severity: normalizeSeverity(record.severity ?? record.Severity),
    count: asNumber(record.count ?? record.Count),
    samples: asStringArray(record.samples ?? record.Samples),
  };
}

function normalizeHealth(raw: unknown): DatabaseHealthReport {
  const record = asRecord(raw);
  const tablesRaw = record.tables ?? record.Tables;
  const issuesRaw = record.issues ?? record.Issues;
  return {
    generatedAtUtc: asString(record.generatedAtUtc ?? record.GeneratedAtUtc),
    databaseSizeBytes: asNumber(record.databaseSizeBytes ?? record.DatabaseSizeBytes),
    totalTableSizeBytes: asNumber(record.totalTableSizeBytes ?? record.TotalTableSizeBytes),
    tables: Array.isArray(tablesRaw) ? tablesRaw.map(normalizeTableStat) : [],
    issues: Array.isArray(issuesRaw) ? issuesRaw.map(normalizeIssue) : [],
  };
}

function normalizeRun(raw: unknown): DatabaseMaintenanceRun {
  const record = asRecord(raw);
  return {
    id: asString(record.id ?? record.Id),
    startedAtUtc: asString(record.startedAtUtc ?? record.StartedAtUtc),
    finishedAtUtc: asString(record.finishedAtUtc ?? record.FinishedAtUtc),
    succeeded: asBoolean(record.succeeded ?? record.Succeeded),
    tableCount: asNumber(record.tableCount ?? record.TableCount),
    successCount: asNumber(record.successCount ?? record.SuccessCount),
    errorCount: asNumber(record.errorCount ?? record.ErrorCount),
    databaseSizeBytes: asNumber(record.databaseSizeBytes ?? record.DatabaseSizeBytes),
    reclaimedBytes: asNumber(record.reclaimedBytes ?? record.ReclaimedBytes),
    errorMessage: asNullableString(record.errorMessage ?? record.ErrorMessage),
  };
}

export const databaseMaintenanceApi = {
  async health(): Promise<DatabaseHealthReport> {
    const raw = await api.get<unknown>(BASE + "/health");
    return normalizeHealth(raw);
  },

  async runs(limit = 10): Promise<DatabaseMaintenanceRun[]> {
    const raw = await api.get<unknown>(BASE + "/runs?limit=" + limit);
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeRun);
  },
};
