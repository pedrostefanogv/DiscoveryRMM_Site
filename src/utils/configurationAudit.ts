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
