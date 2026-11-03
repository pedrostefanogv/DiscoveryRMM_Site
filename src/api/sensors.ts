import { ApiError, api } from "./client";
import { AppApprovalScopeType } from "./types";
import type {
  AgentSensorsPayload,
  SensorChannel,
  SensorChannelUnit,
  SensorComparison,
  SensorCounts,
  SensorDefinition,
  SensorEvent,
  SensorEventKind,
  SensorEventPage,
  SensorFleetAgent,
  SensorFleetByType,
  SensorFleetCounts,
  SensorFleetSummary,
  SensorItem,
  SensorListParams,
  SensorRunResponse,
  SensorSeries,
  SensorSeriesChannel,
  SensorSeriesPoint,
  SensorSeriesStats,
  SensorSeverity,
  SensorStatus,
  SensorStatusStrip,
  SensorType,
  SensorUpsertRequest,
} from "./types";

/**
 * Cliente da aba "Sensores" e do CRUD de definições.
 *
 * A API serializa em camelCase e enums como NOME, mas os normalizadores abaixo
 * aceitam também PascalCase e o valor NUMÉRICO do enum: os agregados (payload da
 * aba, série, eventos, definições) voltam de handlers distintos, e uma resposta
 * antiga/cacheada não pode quebrar a tela por causa da forma do JSON.
 */
const BASE = "/api/v1";
const AGENTS_BASE = `${BASE}/agents`;
const SENSORS_BASE = `${BASE}/sensors`;

// ── Normalizadores primitivos ───────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Lê o valor da chave em camelCase ou PascalCase (ou qualquer caixa). */
function pick(raw: Record<string, unknown>, key: string): unknown {
  if (key in raw) return raw[key];
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  if (pascal in raw) return raw[pascal];
  // Último recurso: comparação case-insensitive (respostas com naming variado).
  const lower = key.toLowerCase();
  for (const candidate of Object.keys(raw)) {
    if (candidate.toLowerCase() === lower) return raw[candidate];
  }
  return undefined;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asString(value: unknown, fallback = ""): string {
  return asNullableString(value) ?? fallback;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asInteger(value: unknown, fallback = 0): number {
  const parsed = asNumber(value);
  return parsed === null ? fallback : Math.trunc(parsed);
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asNumberMap(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(asRecord(value))) {
    const parsed = asNumber(entry);
    if (parsed !== null) result[key] = parsed;
  }
  return result;
}

function asNumberList(value: unknown): number[] {
  return asArray(value)
    .map((entry) => asNumber(entry))
    .filter((entry): entry is number => entry !== null);
}

function asSparklineMap(value: unknown): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const [key, entry] of Object.entries(asRecord(value))) {
    result[key] = asNumberList(entry);
  }
  return result;
}

function asStringList(value: unknown): string[] {
  const parsed = asArray(value)
    .map((entry) => asNullableString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return parsed;
}

/** Nomes canônicos dos enums (o índice é o valor numérico do backend). */
const STATUS_NAMES: readonly SensorStatus[] = [
  "Pending",
  "Passing",
  "Warning",
  "Failing",
  "Unknown",
];
const SEVERITY_NAMES: readonly SensorSeverity[] = ["Info", "Warning", "Critical"];
const TYPE_NAMES: readonly SensorType[] = [
  "DiskSpace",
  "Cpu",
  "Memory",
  "Uptime",
  "Service",
  "Process",
  "Ping",
  "TcpPort",
  "HttpProbe",
  "HttpThroughput",
  "DnsLatency",
  "Bandwidth",
  "DiskIo",
  "EventLogRate",
  "SmartStatus",
  "CertificateExpiry",
  "DefenderStatus",
  "BitLocker",
  "Script",
];
const UNIT_NAMES: readonly SensorChannelUnit[] = [
  "Percent",
  "Bytes",
  "BytesPerSecond",
  "Milliseconds",
  "Seconds",
  "Count",
  "Boolean",
  "MegabitsPerSecond",
  "Days",
  "Celsius",
];
const COMPARISON_NAMES: readonly SensorComparison[] = ["LowerIsWorse", "HigherIsWorse"];
const EVENT_KIND_NAMES: readonly SensorEventKind[] = [
  "FirstRun",
  "StatusChanged",
  "SeverityChanged",
  "AlertRaised",
  "AlertResolved",
  "RunError",
  "Reset",
];
const SCOPE_VALUES: readonly AppApprovalScopeType[] = [
  AppApprovalScopeType.Global,
  AppApprovalScopeType.Client,
  AppApprovalScopeType.Site,
  AppApprovalScopeType.Agent,
];
const SCOPE_NAMES: readonly string[] = ["Global", "Client", "Site", "Agent"];

/**
 * Resolve um enum que pode chegar como nome ("Passing") ou número (1).
 * Sem valor reconhecível, devolve o fallback — nunca lança.
 */
function normalizeEnum<T extends string>(
  value: unknown,
  names: readonly T[],
  fallback: T,
): T {
  if (typeof value === "number" && Number.isInteger(value)) {
    return names[value] ?? fallback;
  }
  const text = asNullableString(value);
  if (!text) return fallback;
  const byName = names.find((name) => name.toLowerCase() === text.toLowerCase());
  if (byName) return byName;
  // Alguns serializadores antigos devolvem o número como string ("1").
  const asIndex = Number(text);
  if (Number.isInteger(asIndex)) return names[asIndex] ?? fallback;
  return fallback;
}

function normalizeScope(value: unknown, fallback: AppApprovalScopeType): AppApprovalScopeType {
  if (typeof value === "number" && Number.isInteger(value)) {
    return SCOPE_VALUES.includes(value as AppApprovalScopeType)
      ? (value as AppApprovalScopeType)
      : fallback;
  }
  const text = asNullableString(value);
  if (!text) return fallback;
  const index = SCOPE_NAMES.findIndex((name) => name.toLowerCase() === text.toLowerCase());
  if (index >= 0) return SCOPE_VALUES[index];
  const asIndex = Number(text);
  return SCOPE_VALUES.includes(asIndex as AppApprovalScopeType)
    ? (asIndex as AppApprovalScopeType)
    : fallback;
}

function normalizeNullableScope(value: unknown): AppApprovalScopeType | null {
  if (value === null || value === undefined || value === "") return null;
  return normalizeScope(value, AppApprovalScopeType.Global);
}

// ── Normalizadores do domínio ──────────────────────────────────────────────

function normalizeSensorChannel(raw: unknown): SensorChannel {
  const record = asRecord(raw);
  return {
    key: asString(pick(record, "key")),
    label: asString(pick(record, "label")),
    unit: normalizeEnum(pick(record, "unit"), UNIT_NAMES, "Count"),
    display: asString(pick(record, "display"), "chart"),
    isPrimary: asBoolean(pick(record, "isPrimary")),
  };
}

function normalizeSensorChannels(value: unknown): SensorChannel[] {
  return asArray(value).map(normalizeSensorChannel);
}

function normalizeSensorCounts(value: unknown): SensorCounts {
  const record = asRecord(value);
  return {
    total: asInteger(pick(record, "total")),
    passing: asInteger(pick(record, "passing")),
    warning: asInteger(pick(record, "warning")),
    failing: asInteger(pick(record, "failing")),
    pending: asInteger(pick(record, "pending")),
    unknown: asInteger(pick(record, "unknown")),
    stale: asInteger(pick(record, "stale")),
  };
}

function normalizeSensorItem(raw: unknown): SensorItem {
  const record = asRecord(raw);
  return {
    sensorId: asString(pick(record, "sensorId")),
    key: asNullableString(pick(record, "key")),
    name: asString(pick(record, "name")),
    description: asNullableString(pick(record, "description")),
    sensorType: normalizeEnum(pick(record, "sensorType"), TYPE_NAMES, "Script"),
    target: asNullableString(pick(record, "target")),
    targetKey: asString(pick(record, "targetKey")),
    scopeType: normalizeScope(pick(record, "scopeType"), AppApprovalScopeType.Agent),
    isInherited: asBoolean(pick(record, "isInherited")),
    sourceScope: normalizeNullableScope(pick(record, "sourceScope")),
    warningThreshold: asNumber(pick(record, "warningThreshold")),
    criticalThreshold: asNumber(pick(record, "criticalThreshold")),
    thresholdUnit: normalizeEnum(pick(record, "thresholdUnit"), UNIT_NAMES, "Count"),
    comparison: normalizeEnum(pick(record, "comparison"), COMPARISON_NAMES, "HigherIsWorse"),
    channels: normalizeSensorChannels(pick(record, "channels")),
    currentChannels: asNumberMap(pick(record, "currentChannels")),
    primaryChannel: asNullableString(pick(record, "primaryChannel")),
    primaryValue: asNumber(pick(record, "primaryValue")),
    sparkline: asSparklineMap(pick(record, "sparkline")),
    status: normalizeEnum(pick(record, "status"), STATUS_NAMES, "Unknown"),
    severity: pick(record, "severity") === null || pick(record, "severity") === undefined
      ? null
      : normalizeEnum(pick(record, "severity"), SEVERITY_NAMES, "Info"),
    message: asNullableString(pick(record, "message")),
    isStale: asBoolean(pick(record, "isStale")),
    exitCode: asNumber(pick(record, "exitCode")),
    durationMs: asNumber(pick(record, "durationMs")),
    outputExcerpt: asNullableString(pick(record, "outputExcerpt")),
    consecutiveFailures: asInteger(pick(record, "consecutiveFailures")),
    totalRuns: asInteger(pick(record, "totalRuns")),
    totalFailures: asInteger(pick(record, "totalFailures")),
    lastRunAt: asNullableString(pick(record, "lastRunAt")),
    lastStatusChangedAt: asNullableString(pick(record, "lastStatusChangedAt")),
    lastAlertedAt: asNullableString(pick(record, "lastAlertedAt")),
    intervalSeconds: asInteger(pick(record, "intervalSeconds")),
    timeoutSeconds: asInteger(pick(record, "timeoutSeconds")),
    failsBeforeAlert: asInteger(pick(record, "failsBeforeAlert"), 1),
    minSeverityToAlert: normalizeEnum(
      pick(record, "minSeverityToAlert"),
      SEVERITY_NAMES,
      "Warning",
    ),
    scriptId: asNullableString(pick(record, "scriptId")),
    scriptName: asNullableString(pick(record, "scriptName")),
    chartJson: asNullableString(pick(record, "chartJson")),
    optionsJson: asNullableString(pick(record, "optionsJson")),
    displayOrder: asInteger(pick(record, "displayOrder")),
    isPinned: asBoolean(pick(record, "isPinned")),
  };
}

export function normalizeAgentSensorsPayload(raw: unknown): AgentSensorsPayload {
  const record = asRecord(raw);
  return {
    agentId: asString(pick(record, "agentId")),
    sensorFingerprint: asString(pick(record, "sensorFingerprint")),
    lastSyncedSensorFingerprint: asNullableString(
      pick(record, "lastSyncedSensorFingerprint"),
    ),
    lastSensorSyncAt: asNullableString(pick(record, "lastSensorSyncAt")),
    upToDate: asBoolean(pick(record, "upToDate")),
    generatedAt: asNullableString(pick(record, "generatedAt")),
    defaultIntervalSeconds: asInteger(pick(record, "defaultIntervalSeconds"), 300),
    staleAfterSeconds: asInteger(pick(record, "staleAfterSeconds"), 900),
    counts: normalizeSensorCounts(pick(record, "counts")),
    items: asArray(pick(record, "items")).map(normalizeSensorItem),
  };
}

function normalizeSeriesPoint(raw: unknown): SensorSeriesPoint {
  const record = asRecord(raw);
  return {
    t: asString(pick(record, "t")),
    v: asNumber(pick(record, "v")),
    min: asNumber(pick(record, "min")),
    max: asNumber(pick(record, "max")),
  };
}

function normalizeSeriesStats(raw: unknown): SensorSeriesStats {
  const record = asRecord(raw);
  return {
    min: asNumber(pick(record, "min")),
    avg: asNumber(pick(record, "avg")),
    max: asNumber(pick(record, "max")),
    p95: asNumber(pick(record, "p95")),
    last: asNumber(pick(record, "last")),
    count: asInteger(pick(record, "count")),
  };
}

function normalizeSeriesChannel(raw: unknown): SensorSeriesChannel {
  const record = asRecord(raw);
  return {
    key: asString(pick(record, "key")),
    label: asString(pick(record, "label")),
    unit: normalizeEnum(pick(record, "unit"), UNIT_NAMES, "Count"),
    points: asArray(pick(record, "points")).map(normalizeSeriesPoint),
    stats: normalizeSeriesStats(pick(record, "stats")),
  };
}

function normalizeStatusStrip(raw: unknown): SensorStatusStrip {
  const record = asRecord(raw);
  return {
    from: asString(pick(record, "from")),
    to: asString(pick(record, "to")),
    status: normalizeEnum(pick(record, "status"), STATUS_NAMES, "Unknown"),
  };
}

function normalizeSensorSeries(raw: unknown): SensorSeries {
  const record = asRecord(raw);
  return {
    agentId: asString(pick(record, "agentId")),
    sensorId: asString(pick(record, "sensorId")),
    targetKey: asString(pick(record, "targetKey")),
    from: asString(pick(record, "from")),
    to: asString(pick(record, "to")),
    resolution: asString(pick(record, "resolution"), "raw"),
    stepSeconds: asInteger(pick(record, "stepSeconds")),
    warningThreshold: asNumber(pick(record, "warningThreshold")),
    criticalThreshold: asNumber(pick(record, "criticalThreshold")),
    comparison: normalizeEnum(pick(record, "comparison"), COMPARISON_NAMES, "HigherIsWorse"),
    thresholdUnit: normalizeEnum(pick(record, "thresholdUnit"), UNIT_NAMES, "Count"),
    channels: asArray(pick(record, "channels")).map(normalizeSeriesChannel),
    statusStrips: asArray(pick(record, "statusStrips")).map(normalizeStatusStrip),
  };
}

function normalizeSensorEvent(raw: unknown): SensorEvent {
  const record = asRecord(raw);
  return {
    id: asString(pick(record, "id")),
    targetKey: asString(pick(record, "targetKey")),
    kind: normalizeEnum(pick(record, "kind"), EVENT_KIND_NAMES, "StatusChanged"),
    status: normalizeEnum(pick(record, "status"), STATUS_NAMES, "Unknown"),
    severity: pick(record, "severity") === null || pick(record, "severity") === undefined
      ? null
      : normalizeEnum(pick(record, "severity"), SEVERITY_NAMES, "Info"),
    previousStatus: pick(record, "previousStatus") === null ||
      pick(record, "previousStatus") === undefined
      ? null
      : normalizeEnum(pick(record, "previousStatus"), STATUS_NAMES, "Unknown"),
    previousSeverity: pick(record, "previousSeverity") === null ||
      pick(record, "previousSeverity") === undefined
      ? null
      : normalizeEnum(pick(record, "previousSeverity"), SEVERITY_NAMES, "Info"),
    message: asNullableString(pick(record, "message")),
    exitCode: asNumber(pick(record, "exitCode")),
    occurredAt: asNullableString(pick(record, "occurredAt")),
  };
}

function normalizeSensorEventPage(raw: unknown): SensorEventPage {
  const record = asRecord(raw);
  return {
    items: asArray(pick(record, "items")).map(normalizeSensorEvent),
    nextCursor: asNullableString(pick(record, "nextCursor")),
  };
}

function normalizeSensorDefinition(raw: unknown): SensorDefinition {
  const record = asRecord(raw);
  return {
    id: asString(pick(record, "id")),
    key: asNullableString(pick(record, "key")),
    name: asString(pick(record, "name")),
    description: asNullableString(pick(record, "description")),
    sensorType: normalizeEnum(pick(record, "sensorType"), TYPE_NAMES, "Script"),
    scopeType: normalizeScope(pick(record, "scopeType"), AppApprovalScopeType.Agent),
    clientId: asNullableString(pick(record, "clientId")),
    siteId: asNullableString(pick(record, "siteId")),
    agentId: asNullableString(pick(record, "agentId")),
    includeTags: asStringList(pick(record, "includeTags")),
    excludeTags: asStringList(pick(record, "excludeTags")),
    target: asNullableString(pick(record, "target")),
    warningThreshold: asNumber(pick(record, "warningThreshold")),
    criticalThreshold: asNumber(pick(record, "criticalThreshold")),
    thresholdUnit: normalizeEnum(pick(record, "thresholdUnit"), UNIT_NAMES, "Count"),
    comparison: normalizeEnum(pick(record, "comparison"), COMPARISON_NAMES, "HigherIsWorse"),
    optionsJson: asNullableString(pick(record, "optionsJson")),
    scriptId: asNullableString(pick(record, "scriptId")),
    scriptName: asNullableString(pick(record, "scriptName")),
    channels: normalizeSensorChannels(pick(record, "channels")),
    extractorsJson: asNullableString(pick(record, "extractorsJson")),
    exitCodeMapJson: asNullableString(pick(record, "exitCodeMapJson")),
    chartJson: asNullableString(pick(record, "chartJson")),
    intervalSeconds: asInteger(pick(record, "intervalSeconds")),
    timeoutSeconds: asInteger(pick(record, "timeoutSeconds"), 10),
    storeSamples: asBoolean(pick(record, "storeSamples")),
    failsBeforeAlert: asInteger(pick(record, "failsBeforeAlert"), 1),
    minSeverityToAlert: normalizeEnum(
      pick(record, "minSeverityToAlert"),
      SEVERITY_NAMES,
      "Warning",
    ),
    severityWhenFailing: normalizeEnum(
      pick(record, "severityWhenFailing"),
      SEVERITY_NAMES,
      "Critical",
    ),
    alertOnSensorError: asBoolean(pick(record, "alertOnSensorError")),
    displayOrder: asInteger(pick(record, "displayOrder")),
    isPinned: asBoolean(pick(record, "isPinned")),
    isActive: pick(record, "isActive") === undefined ? true : asBoolean(pick(record, "isActive")),
    lastUpdatedAt: asNullableString(pick(record, "lastUpdatedAt")),
    createdAt: asNullableString(pick(record, "createdAt")),
    updatedAt: asNullableString(pick(record, "updatedAt")),
    createdBy: asNullableString(pick(record, "createdBy")),
    isInherited: asBoolean(pick(record, "isInherited")),
    sourceScope: normalizeNullableScope(pick(record, "sourceScope")),
  };
}

/** A listagem pode voltar como array puro ou embrulhada em { items }. */
function normalizeSensorDefinitionList(raw: unknown): SensorDefinition[] {
  if (Array.isArray(raw)) return raw.map(normalizeSensorDefinition);
  const record = asRecord(raw);
  const collection = asArray(pick(record, "items")).length > 0
    ? pick(record, "items")
    : pick(record, "data");
  return asArray(collection).map(normalizeSensorDefinition);
}

function normalizeSensorFleetCounts(value: unknown): SensorFleetCounts {
  const record = asRecord(value);
  return {
    total: asInteger(pick(record, "total")),
    passing: asInteger(pick(record, "passing")),
    warning: asInteger(pick(record, "warning")),
    failing: asInteger(pick(record, "failing")),
    pending: asInteger(pick(record, "pending")),
    unknown: asInteger(pick(record, "unknown")),
    // Dimensão separada dos status: sensor sem dado recente (stale <= total).
    stale: asInteger(pick(record, "stale")),
    agentsWithFailing: asInteger(pick(record, "agentsWithFailing")),
  };
}

function normalizeSensorFleetByType(raw: unknown): SensorFleetByType {
  const record = asRecord(raw);
  return {
    sensorType: normalizeEnum(pick(record, "sensorType"), TYPE_NAMES, "Script"),
    total: asInteger(pick(record, "total")),
    warning: asInteger(pick(record, "warning")),
    failing: asInteger(pick(record, "failing")),
  };
}

function normalizeSensorFleetAgent(raw: unknown): SensorFleetAgent {
  const record = asRecord(raw);
  const worstSeverity = pick(record, "worstSeverity");
  return {
    agentId: asString(pick(record, "agentId")),
    hostname: asString(pick(record, "hostname")),
    displayName: asNullableString(pick(record, "displayName")),
    clientId: asNullableString(pick(record, "clientId")),
    clientName: asNullableString(pick(record, "clientName")),
    siteId: asNullableString(pick(record, "siteId")),
    siteName: asNullableString(pick(record, "siteName")),
    failing: asInteger(pick(record, "failing")),
    warning: asInteger(pick(record, "warning")),
    worstSeverity:
      worstSeverity === null || worstSeverity === undefined
        ? null
        : normalizeEnum(worstSeverity, SEVERITY_NAMES, "Info"),
  };
}

export function normalizeSensorFleetSummary(raw: unknown): SensorFleetSummary {
  const record = asRecord(raw);
  return {
    generatedAt: asNullableString(pick(record, "generatedAt")),
    clientId: asNullableString(pick(record, "clientId")),
    siteId: asNullableString(pick(record, "siteId")),
    counts: normalizeSensorFleetCounts(pick(record, "counts")),
    byType: asArray(pick(record, "byType")).map(normalizeSensorFleetByType),
    top: asArray(pick(record, "top")).map(normalizeSensorFleetAgent),
  };
}

function normalizeSensorRunResponse(raw: unknown): SensorRunResponse {
  const record = asRecord(raw);
  return {
    commandId: asNullableString(pick(record, "commandId")),
    dispatched: asBoolean(pick(record, "dispatched")),
    sensorCount: asInteger(pick(record, "sensorCount")),
    message: asNullableString(pick(record, "message")),
  };
}

// ── Tipos das chamadas ─────────────────────────────────────────────────────

export interface SensorSeriesParams {
  /** Início da janela (ISO). */
  from: string;
  /** Fim da janela (ISO). */
  to: string;
  /** Canais desejados; vazio devolve todos os declarados. */
  channels?: string[];
  /** Alvo específico (sensor de script com múltiplos alvos). */
  targetKey?: string | null;
  /** "auto" (default) | "raw" | "hourly" | "daily". */
  step?: string;
}

/** Filtros do resumo da frota (GET /api/v1/sensors/summary). */
export interface SensorFleetSummaryParams {
  clientId?: string;
  siteId?: string;
}

export interface SensorEventsParams {
  limit?: number;
  targetKey?: string | null;
  /** Cursor da página anterior (o backend devolve nextCursor). */
  cursor?: string | null;
}

/**
 * 409 do "executar agora" significa agent offline: o operador precisa da
 * mensagem certa e não de "erro inesperado".
 */
export function isSensorOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

/** Mensagem PT-BR para falhas das ações de sensor (nunca vaza stack). */
export function describeSensorsError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return error.message || "O agente está offline — a coleta não pode ser solicitada agora.";
    }
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}

// ── API ────────────────────────────────────────────────────────────────────

export const sensorsApi = {
  /** Aba "Sensores": definições aplicáveis + estado atual de cada uma. */
  async agentSensors(agentId: string): Promise<AgentSensorsPayload> {
    const raw = await api.get<unknown>(`${AGENTS_BASE}/${agentId}/sensors`);
    return normalizeAgentSensorsPayload(raw);
  },

  /** Série temporal de um sensor para o gráfico. */
  async series(
    agentId: string,
    sensorId: string,
    params: SensorSeriesParams,
  ): Promise<SensorSeries> {
    const query: Record<string, unknown> = {
      from: params.from,
      to: params.to,
      step: params.step ?? "auto",
    };
    // O endpoint espera a lista de canais separada por vírgula.
    if (params.channels && params.channels.length > 0) {
      query.channels = params.channels.join(",");
    }
    if (params.targetKey) query.targetKey = params.targetKey;
    const raw = await api.get<unknown>(
      `${AGENTS_BASE}/${agentId}/sensors/${sensorId}/series`,
      query,
    );
    return normalizeSensorSeries(raw);
  },

  /** Histórico de eventos do sensor (cursor). */
  async events(
    agentId: string,
    sensorId: string,
    params: SensorEventsParams = {},
  ): Promise<SensorEventPage> {
    const query: Record<string, unknown> = {};
    if (params.limit) query.limit = params.limit;
    if (params.targetKey) query.targetKey = params.targetKey;
    if (params.cursor) query.cursor = params.cursor;
    const raw = await api.get<unknown>(
      `${AGENTS_BASE}/${agentId}/sensors/${sensorId}/events`,
      query,
    );
    return normalizeSensorEventPage(raw);
  },

  /** Pede a coleta agora (todos os sensores ou uma seleção). 409 = agent offline. */
  async run(agentId: string, sensorIds?: string[]): Promise<SensorRunResponse> {
    const body = sensorIds && sensorIds.length > 0 ? { sensorIds } : {};
    const raw = await api.post<unknown>(`${AGENTS_BASE}/${agentId}/sensors/run`, body);
    return normalizeSensorRunResponse(raw);
  },

  /** Zera estado/falhas de um sensor (não apaga a definição). */
  async resetState(agentId: string, sensorId: string): Promise<void> {
    await api.post<unknown>(`${AGENTS_BASE}/${agentId}/sensors/${sensorId}/reset`);
  },

  /** Força o agent a re-sincronizar a policy de sensores agora. */
  async syncNow(agentId: string): Promise<void> {
    await api.post<unknown>(`${AGENTS_BASE}/${agentId}/sensors/sync-now`);
  },

  /** Agregados da frota (página "Sensores"): contadores, tipos e top agentes. */
  async fleetSummary(params: SensorFleetSummaryParams = {}): Promise<SensorFleetSummary> {
    const query: Record<string, unknown> = {};
    if (params.clientId) query.clientId = params.clientId;
    if (params.siteId) query.siteId = params.siteId;
    const raw = await api.get<unknown>(`${SENSORS_BASE}/summary`, query);
    return normalizeSensorFleetSummary(raw);
  },

  /** Definições (CRUD). Sem filtro devolve tudo que o usuário pode ver. */
  async listDefinitions(params: SensorListParams = {}): Promise<SensorDefinition[]> {
    const raw = await api.get<unknown>(SENSORS_BASE, params as Record<string, unknown>);
    return normalizeSensorDefinitionList(raw);
  },

  async create(data: SensorUpsertRequest): Promise<SensorDefinition> {
    const raw = await api.post<unknown>(SENSORS_BASE, data);
    return normalizeSensorDefinition(raw);
  },

  async update(id: string, data: SensorUpsertRequest): Promise<SensorDefinition> {
    const raw = await api.put<unknown>(`${SENSORS_BASE}/${id}`, data);
    return normalizeSensorDefinition(raw);
  },

  async remove(id: string): Promise<void> {
    await api.del<unknown>(`${SENSORS_BASE}/${id}`);
  },
};

/** Reexports usados pelos componentes (evita importar de types em cada um). */
export type {
  AgentSensorsPayload,
  SensorChannel,
  SensorFleetAgent,
  SensorFleetByType,
  SensorFleetCounts,
  SensorFleetSummary,
  SensorChannelUnit,
  SensorComparison,
  SensorCounts,
  SensorDefinition,
  SensorEvent,
  SensorEventKind,
  SensorEventPage,
  SensorItem,
  SensorListParams,
  SensorRunResponse,
  SensorSeries,
  SensorSeriesChannel,
  SensorSeriesPoint,
  SensorSeriesStats,
  SensorSeverity,
  SensorStatus,
  SensorStatusStrip,
  SensorType,
  SensorUpsertRequest,
};
