import type {
  DatasetCatalogItem,
  ReportDatasetFieldMetadata,
  ReportDatasetJoinCapability,
} from "@/api/types";

// ── Derivacao de chaves de join a partir do catalogo ──────
//
// O console NAO pode manter uma matriz estatica de chaves de join: o backend
// expoe a verdade por dataset em GET /reports/datasets
//   - joinCapabilities[]  -> pares (sourceKey -> targetKey) validos
//   - fieldMetadata[]     -> isJoinKey, reference, defaultAlias
//
// A matriz estatica anterior omitia 7 datasets (agentSensors, windowsUpdates,
// patchCompliance, patchApprovals, patchApprovalAudit, agents, ticketAnswers),
// por isso "Sensores (estado e metricas)" nunca encontrava chave comum.

export const DEFAULT_PRIMARY_ALIAS = "base";

/** Chave estavel de um dataset do catalogo (key > type > datasetType). */
export function getDatasetKey(item: DatasetCatalogItem | undefined | null): string {
  if (!item) return "";
  const raw = item.key ?? item.type ?? item.datasetType;
  return raw === undefined || raw === null ? "" : String(raw);
}

/** DatasetType estavel (datasetType > type > key). */
export function getDatasetType(item: DatasetCatalogItem | undefined | null): string {
  if (!item) return "";
  const raw = item.datasetType ?? item.type ?? item.key;
  return raw === undefined || raw === null ? "" : String(raw);
}

function normalizeJoinKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Tira o prefixo de alias de uma referencia: "hw.agentId" -> "agentId".
 * O backend mistura os dois formatos (reference as vezes vem com alias),
 * entao toda comparacao entre lados passa por aqui.
 */
export function stripAlias(value: string | undefined | null): string {
  const normalized = normalizeJoinKey(value);
  if (!normalized) return "";
  const dot = normalized.indexOf(".");
  return dot >= 0 ? normalized.slice(dot + 1) : normalized;
}

/**
 * Remove o prefixo "dataSources[i]." / "columns[0]." etc. que some dos
 * campos do layout, preservando o alias.field quando existir.
 */
export function normalizeFieldPath(value: string | undefined | null): string {
  const normalized = normalizeJoinKey(value);
  if (!normalized) return "";
  // "colunas[0].hw.agentId" -> "hw.agentId"
  const withoutIndex = normalized.replace(/^[A-Za-z_$][\w$]*\[\d+\]\./, "");
  return withoutIndex;
}

/** Campos do metadata que servem como chave de ligacao. */
export function getJoinKeyFields(
  item: DatasetCatalogItem | undefined | null,
): ReportDatasetFieldMetadata[] {
  const metadata = Array.isArray(item?.fieldMetadata) ? item!.fieldMetadata! : [];
  return metadata.filter(
    (field) => field?.isJoinKey && (field.reference ?? field.field),
  );
}

/**
 * Todas as chaves canonicas de um dataset (sem alias, deduplicadas).
 *
 * FONTE AUTORITATIVA: fieldMetadata[].isJoinKey. O backend limita o total de
 * joinCapabilities (teto de sugestoes) e o consome em varredura sequencial,
 * entao datasets no fim do catalogo (ex.: agentSensors, o 29o) podem chegar
 * com capabilities VAZIAS. Depender delas reintroduziria o bug. A metadata de
 * campos nao tem teto e e a unica base confiavel.
 *
 * capabilities entram apenas como enriquecimento OPCIONAL, para o caso de um
 * backend antigo expor capacidade sem marcar o campo como chave.
 */
export function getJoinKeys(item: DatasetCatalogItem | undefined | null): string[] {
  if (!item) return [];
  const keys = new Set<string>();

  // 1) Caminho principal (sem teto): metadata dos campos.
  for (const field of item.fieldMetadata ?? []) {
    if (!field?.isJoinKey) continue;
    collectJoinKey(keys, field.reference);
    collectJoinKey(keys, field.field);
  }

  // 2) Enriquecimento opcional (pode estar truncado pelo teto do backend).
  if (keys.size === 0) {
    for (const capability of item.joinCapabilities ?? []) {
      collectJoinKey(keys, capability?.sourceKey);
      collectJoinKey(keys, capability?.targetKey);
    }
  }

  return [...keys];
}

function collectJoinKey(target: Set<string>, value: unknown): void {
  const key = stripAlias(typeof value === "string" ? value : "");
  if (key) target.add(key);
}

/**
 * Chaves comuns entre dois datasets, na ordem de preferencia
 * (agentId > clientId > siteId > restante por ordem do catalogo da origem).
 */
export function findCommonJoinKeys(
  source: DatasetCatalogItem | undefined | null,
  target: DatasetCatalogItem | undefined | null,
): string[] {
  const targetKeys = new Set(getJoinKeys(target));
  if (targetKeys.size === 0) return [];

  const common = getJoinKeys(source).filter((key) => targetKeys.has(key));
  const preferred = ["agentId", "clientId", "siteId"];
  return common.sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    return (ai === -1 ? preferred.length : ai) - (bi === -1 ? preferred.length : bi);
  });
}

/** Chave preferida de um conjunto de chaves comuns (ou undefined). */
export function pickPreferredJoinKey(commonKeys: string[]): string | undefined {
  if (commonKeys.length === 0) return undefined;
  for (const preferred of ["agentId", "clientId", "siteId"]) {
    if (commonKeys.includes(preferred)) return preferred;
  }
  return commonKeys[0];
}

/**
 * Alias sugerido do dataset.
 *
 * O catalogo expoe defaultAlias por CAMPO no formato "{alias}.{field}"
 * (ex.: "hw.agentId"), entao aqui extraimos apenas o prefixo. O prefixo e o
 * mesmo para todos os campos do dataset, logo o primeiro ja basta.
 */
export function getDefaultAlias(item: DatasetCatalogItem | undefined | null): string {
  if (!item) return DEFAULT_PRIMARY_ALIAS;

  for (const field of item.fieldMetadata ?? []) {
    const value = field?.defaultAlias;
    if (typeof value !== "string" || !value.trim()) continue;
    const trimmed = value.trim();
    const dot = trimmed.indexOf(".");
    const prefix = dot > 0 ? trimmed.slice(0, dot) : trimmed;
    if (prefix) return prefix;
  }

  const key = getDatasetKey(item);
  return key ? key.substring(0, 3) : DEFAULT_PRIMARY_ALIAS;
}

/**
 * Normaliza uma capability em pares (sourceKey, targetKey) sem alias.
 * Ignora capabilities degeneradas (vazias ou k->k) que o backend antigo
 * gerava: elas nao descrevem um par real origem/destino.
 */
export function normalizeJoinCapabilities(
  item: DatasetCatalogItem | undefined | null,
): Array<{ sourceKey: string; targetKey: string; joinType?: string; description?: string }> {
  const result: Array<{
    sourceKey: string;
    targetKey: string;
    joinType?: string;
    description?: string;
  }> = [];

  for (const capability of item?.joinCapabilities ?? []) {
    const normalized = normalizeJoinCapability(capability);
    if (normalized) result.push(normalized);
  }

  return result;
}

export function normalizeJoinCapability(
  capability: ReportDatasetJoinCapability | undefined | null,
): { sourceKey: string; targetKey: string; joinType?: string; description?: string } | null {
  const sourceKey = stripAlias(capability?.sourceKey);
  const targetKey = stripAlias(capability?.targetKey);
  if (!sourceKey || !targetKey) return null;

  const joinTypes = Array.isArray(capability?.joinTypes)
    ? capability!.joinTypes!.filter((t): t is string => typeof t === "string" && t.trim() !== "")
    : [];

  return {
    sourceKey,
    targetKey,
    joinType: joinTypes[0]?.trim() || undefined,
    description:
      typeof capability?.description === "string" && capability.description.trim()
        ? capability.description.trim()
        : undefined,
  };
}

/** Opcoes de campo para os seletores de chave, com chaves de join primeiro. */
export function getJoinFieldOptions(
  item: DatasetCatalogItem | undefined | null,
): ReportDatasetFieldMetadata[] {
  const metadata = Array.isArray(item?.fieldMetadata) ? item!.fieldMetadata! : [];
  const withValue = metadata.filter((field) => field?.reference ?? field?.field);

  return [
    ...withValue.filter((field) => field.isJoinKey),
    ...withValue.filter((field) => !field.isJoinKey),
  ];
}

/** Indexa o catalogo por chave de dataset para reidratacao. */
export function indexCatalogByKey(
  datasets: DatasetCatalogItem[],
): Map<string, DatasetCatalogItem> {
  const map = new Map<string, DatasetCatalogItem>();
  for (const item of datasets) {
    for (const candidate of [getDatasetKey(item), getDatasetType(item), item.key, item.type]) {
      if (candidate && !map.has(String(candidate))) {
        map.set(String(candidate), item);
      }
    }
  }
  return map;
}
