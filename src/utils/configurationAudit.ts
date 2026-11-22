import type { ConfigurationAuditEntry } from "@/api";

/** Rótulos amigáveis para o tipo de entidade auditada. */
export const ENTITY_LABELS: Record<string, string> = {
  Server: "Servidor",
  Client: "Cliente",
  Site: "Site",
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

/**
 * UUID truncado para exibição. A auditoria é interna, mas evitar expor o
 * identificador completo por padrão reduz vazamento de identificadores internos.
 */
export function shortEntityId(entityId: string): string {
  if (!entityId || entityId.length <= 12) return entityId;
  return `${entityId.slice(0, 8)}…`;
}

/** Escapa um valor para CSV (aspas, vírgulas e quebras de linha). */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** Monta o CSV completo da auditoria (cabeçalho + linhas). */
export function buildAuditCsv(entries: ConfigurationAuditEntry[]): string {
  const header = [
    "changedAt",
    "entityType",
    "entityId",
    "fieldName",
    "oldValue",
    "newValue",
    "changedBy",
    "entityVersion",
  ];

  const lines = entries.map((entry) =>
    [
      entry.changedAt,
      entityLabel(entry.entityType),
      entry.entityId,
      entry.fieldName,
      entry.oldValue,
      entry.newValue,
      entry.changedBy,
      entry.entityVersion,
    ]
      .map(csvCell)
      .join(","),
  );

  return `${header.join(",")}\n${lines.join("\n")}`;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

export function clampAuditNumber(
  raw: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeDateRangeForReport(
  startDate: string,
  endDate: string,
): { startIso: string; endIso: string } | null {
  const start = startDate.trim();
  const end = endDate.trim();
  if (!start || !end || end < start) return null;
  return {
    startIso: `${start}T00:00:00`,
    endIso: `${end}T23:59:59.999`,
  };
}

export interface FormattedAuditValue {
  text: string;
  isEmpty: boolean;
  isJson: boolean;
}

export function formatAuditValue(value: unknown): FormattedAuditValue {
  if (value === null || value === undefined) {
    return { text: "— (vazio)", isEmpty: true, isJson: false };
  }

  if (typeof value === "string") {
    if (value === "") {
      return { text: '"" (string vazia)', isEmpty: true, isJson: false };
    }
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          text: JSON.stringify(parsed, null, 2),
          isEmpty: false,
          isJson: true,
        };
      } catch {
        // Fallback to raw string if not valid JSON
      }
    }
    return { text: value, isEmpty: false, isJson: false };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return { text: String(value), isEmpty: false, isJson: false };
  }

  try {
    return {
      text: JSON.stringify(value, null, 2),
      isEmpty: false,
      isJson: true,
    };
  } catch {
    return { text: "[valor não serializável]", isEmpty: false, isJson: false };
  }
}

export interface AuditClientFilter {
  entityType: "" | "Server" | "Client" | "Site";
  entityId: string;
  fieldName: string;
  username: string;
  startDate: string;
  endDate: string;
  search: string;
}

function stringifySearchable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function filterAuditEntries(
  entries: ConfigurationAuditEntry[],
  filters: AuditClientFilter,
  entityNameById: Map<string, string>,
): ConfigurationAuditEntry[] {
  const entityIdTerm = filters.entityId.trim().toLowerCase();
  const fieldTerm = filters.fieldName.trim().toLowerCase();
  const userTerm = filters.username.trim().toLowerCase();
  const searchTerm = filters.search.trim().toLowerCase();

  const startMs = filters.startDate
    ? new Date(`${filters.startDate}T00:00:00`).getTime()
    : Number.NaN;
  const endMs = filters.endDate
    ? new Date(`${filters.endDate}T23:59:59.999`).getTime()
    : Number.NaN;

  return entries.filter((entry) => {
    if (filters.entityType && entry.entityType !== filters.entityType) {
      return false;
    }

    const resolvedName = entityNameById.get(entry.entityId) ?? "";

    if (entityIdTerm) {
      const idMatches = entry.entityId.toLowerCase().includes(entityIdTerm);
      const nameMatches = resolvedName.toLowerCase().includes(entityIdTerm);
      if (!idMatches && !nameMatches) {
        return false;
      }
    }

    if (fieldTerm && !entry.fieldName.toLowerCase().includes(fieldTerm)) {
      return false;
    }

    if (userTerm && !(entry.changedBy ?? "").toLowerCase().includes(userTerm)) {
      return false;
    }

    if (Number.isFinite(startMs) || Number.isFinite(endMs)) {
      const changedMs = new Date(entry.changedAt).getTime();
      if (Number.isFinite(startMs) && changedMs < startMs) {
        return false;
      }
      if (Number.isFinite(endMs) && changedMs > endMs) {
        return false;
      }
    }

    if (searchTerm) {
      const haystack = [
        entry.fieldName,
        entry.entityId,
        resolvedName,
        entry.changedBy ?? "",
        stringifySearchable(entry.oldValue),
        stringifySearchable(entry.newValue),
        entry.reason ?? "",
        entry.ipAddress ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) {
        return false;
      }
    }

    return true;
  });
}
