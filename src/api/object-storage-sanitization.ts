import { api } from "./client";

const BASE = "/api/v1/admin/object-storage-sanitization";

export interface ObjectStorageSanitizationCheckDescriptor {
  key: string;
  title: string;
  description: string;
  /** Verificação apenas de relatório: nunca altera o storage. */
  reportOnly: boolean;
}

export interface ObjectStorageSanitizationCheckResult {
  key: string;
  title: string;
  /** Objetos avaliados pela verificação. */
  examined: number;
  /** Objetos órfãos encontrados. */
  found: number;
  /** Objetos removidos do storage (0 em dry-run). */
  fixed: number;
  skipped: number;
  hasMore: boolean;
  error: string | null;
  foundBytes: number;
  fixedBytes: number;
  samples: string[];
}

export interface ObjectStorageInventoryEntry {
  prefix: string;
  objects: number;
  bytes: number;
}

export interface ObjectStorageSanitizationReport {
  startedAtUtc: string;
  finishedAtUtc: string;
  dryRun: boolean;
  minAgeHours: number;
  totalObjects: number;
  totalBytes: number;
  truncated: boolean;
  inventory: ObjectStorageInventoryEntry[];
  totalExamined: number;
  totalFound: number;
  totalFixed: number;
  totalFoundBytes: number;
  totalFixedBytes: number;
  checks: ObjectStorageSanitizationCheckResult[];
}

export interface ObjectStorageSanitizationRequest {
  dryRun: boolean;
  checks?: string[];
  /** Idade mínima (horas) para um objeto sem vínculo ser considerado órfão. */
  minAgeHours?: number;
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

function normalizeCheck(raw: unknown): ObjectStorageSanitizationCheckResult {
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
    foundBytes: asNumber(record.foundBytes ?? record.FoundBytes),
    fixedBytes: asNumber(record.fixedBytes ?? record.FixedBytes),
    samples: asStringArray(record.samples ?? record.Samples),
  };
}

function normalizeInventoryEntry(raw: unknown): ObjectStorageInventoryEntry {
  const record = asRecord(raw);
  return {
    prefix: asString(record.prefix ?? record.Prefix),
    objects: asNumber(record.objects ?? record.Objects),
    bytes: asNumber(record.bytes ?? record.Bytes),
  };
}

function normalizeReport(raw: unknown): ObjectStorageSanitizationReport {
  const record = asRecord(raw);
  const checksRaw = record.checks ?? record.Checks;
  const inventoryRaw = record.inventory ?? record.Inventory;
  return {
    startedAtUtc: asString(record.startedAtUtc ?? record.StartedAtUtc),
    finishedAtUtc: asString(record.finishedAtUtc ?? record.FinishedAtUtc),
    dryRun: asBoolean(record.dryRun ?? record.DryRun),
    minAgeHours: asNumber(record.minAgeHours ?? record.MinAgeHours, 24),
    totalObjects: asNumber(record.totalObjects ?? record.TotalObjects),
    totalBytes: asNumber(record.totalBytes ?? record.TotalBytes),
    truncated: asBoolean(record.truncated ?? record.Truncated),
    inventory: Array.isArray(inventoryRaw) ? inventoryRaw.map(normalizeInventoryEntry) : [],
    totalExamined: asNumber(record.totalExamined ?? record.TotalExamined),
    totalFound: asNumber(record.totalFound ?? record.TotalFound),
    totalFixed: asNumber(record.totalFixed ?? record.TotalFixed),
    totalFoundBytes: asNumber(record.totalFoundBytes ?? record.TotalFoundBytes),
    totalFixedBytes: asNumber(record.totalFixedBytes ?? record.TotalFixedBytes),
    checks: Array.isArray(checksRaw) ? checksRaw.map(normalizeCheck) : [],
  };
}

export const objectStorageSanitizationApi = {
  /** Verificações disponíveis (títulos/descrições para a tela). */
  async checks(): Promise<ObjectStorageSanitizationCheckDescriptor[]> {
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

  /** Varre o bucket (dry-run) ou remove os órfãos (dryRun: false). */
  async run(payload: ObjectStorageSanitizationRequest): Promise<ObjectStorageSanitizationReport> {
    const raw = await api.post<unknown>(BASE + "/run", {
      dryRun: payload.dryRun,
      checks: payload.checks,
      minAgeHours: payload.minAgeHours,
    });
    return normalizeReport(raw);
  },
};
