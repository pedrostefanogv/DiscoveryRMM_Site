import { formatBytes } from "@/utils/format";
import { AppApprovalScopeType } from "@/api/types";
import type {
  SensorChannel,
  SensorChannelUnit,
  SensorComparison,
  SensorEventKind,
  SensorItem,
  SensorSeries,
  SensorSeverity,
  SensorStatus,
  SensorType,
  SensorUpsertRequest,
} from "@/api";

/**
 * Rótulos e formatadores da aba "Sensores".
 *
 * Ficam fora do painel porque badge, sparkline, gráfico e formulário precisam
 * das MESMAS palavras (status/tipo/unidade) — se a tradução viver em dois
 * lugares, um deles diverge.
 */

export interface SensorStatusMeta {
  label: string;
  /** Cor do Badge do kit. */
  color: "success" | "warning" | "danger" | "slate";
  /** Glifo Material Symbols usado no badge e nos chips. */
  icon: "check_circle" | "warning" | "error" | "help" | "schedule";
  /** Classe do ponto colorido (mesmo formato de HEALTH_DOT_CLASSES). */
  dotClass: string;
}

export const SENSOR_STATUS_META: Record<SensorStatus, SensorStatusMeta> = {
  Passing: { label: "OK", color: "success", icon: "check_circle", dotClass: "bg-success" },
  Warning: { label: "Atenção", color: "warning", icon: "warning", dotClass: "bg-warning" },
  Failing: { label: "Crítico", color: "danger", icon: "error", dotClass: "bg-danger" },
  Unknown: { label: "Sem dados", color: "slate", icon: "help", dotClass: "bg-muted" },
  Pending: { label: "Aguardando", color: "slate", icon: "schedule", dotClass: "bg-muted" },
};

/**
 * Estado "sem dados recentes": o sensor tem histórico mas não coleta há mais de
 * N× o intervalo. É diferente de Unknown (nunca/sem leitura) — o operador
 * precisa saber que a definição existe e está atrasada.
 */
export const SENSOR_STALE_META: SensorStatusMeta = {
  label: "Sem dados recentes",
  color: "slate",
  icon: "schedule",
  dotClass: "bg-warning",
};

/**
 * Metadados de exibição de um item: o "stale" (coleta atrasada) tem prioridade
 * sobre o último status conhecido, mas nunca esconde um Crítico — quem está
 * falhando e parou de coletar continua crítico.
 */
export function sensorStatusMeta(
  status: SensorStatus,
  isStale = false,
): SensorStatusMeta {
  if (isStale && status !== "Failing") return SENSOR_STALE_META;
  return SENSOR_STATUS_META[status] ?? SENSOR_STATUS_META.Unknown;
}

export const SENSOR_TYPE_LABELS: Record<SensorType, string> = {
  DiskSpace: "Espaço em disco",
  Cpu: "CPU",
  Memory: "Memória",
  Uptime: "Tempo ligado",
  Service: "Serviço do Windows",
  Process: "Processo",
  Ping: "Ping (ICMP)",
  TcpPort: "Porta TCP",
  HttpProbe: "HTTP (probe)",
  HttpThroughput: "HTTP (throughput)",
  DnsLatency: "Latência de DNS",
  Bandwidth: "Banda (rede)",
  DiskIo: "I/O de disco",
  EventLogRate: "Taxa de eventos (log)",
  SmartStatus: "Saúde do disco (SMART)",
  CertificateExpiry: "Expiração de certificado",
  DefenderStatus: "Microsoft Defender",
  BitLocker: "BitLocker",
  Script: "Script (métricas)",
};

/** Ordem dos tipos no select do formulário (built-ins primeiro, Script por último). */
export const SENSOR_TYPE_OPTIONS: { value: SensorType; label: string }[] = (
  Object.keys(SENSOR_TYPE_LABELS) as SensorType[]
).map((value) => ({ value, label: SENSOR_TYPE_LABELS[value] }));

export function sensorTypeLabel(value: SensorType | string | null | undefined): string {
  if (!value) return "—";
  return SENSOR_TYPE_LABELS[value as SensorType] ?? String(value);
}

export const SENSOR_SCOPE_LABELS: Record<AppApprovalScopeType, string> = {
  [AppApprovalScopeType.Global]: "Global",
  [AppApprovalScopeType.Client]: "Cliente",
  [AppApprovalScopeType.Site]: "Site",
  [AppApprovalScopeType.Agent]: "Agente",
};

export function sensorScopeLabel(value: AppApprovalScopeType | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return SENSOR_SCOPE_LABELS[value] ?? "—";
}

export const SENSOR_SEVERITY_LABELS: Record<SensorSeverity, string> = {
  Info: "Informativo",
  Warning: "Atenção",
  Critical: "Crítico",
};

export const SENSOR_SEVERITY_OPTIONS: { value: SensorSeverity; label: string }[] = [
  { value: "Info", label: SENSOR_SEVERITY_LABELS.Info },
  { value: "Warning", label: SENSOR_SEVERITY_LABELS.Warning },
  { value: "Critical", label: SENSOR_SEVERITY_LABELS.Critical },
];

export const SENSOR_UNIT_LABELS: Record<SensorChannelUnit, string> = {
  Percent: "Porcentagem (%)",
  Bytes: "Bytes",
  BytesPerSecond: "Bytes por segundo",
  Milliseconds: "Milissegundos (ms)",
  Seconds: "Segundos (s)",
  Count: "Contagem",
  Boolean: "Sim/Não",
  MegabitsPerSecond: "Megabits por segundo (Mbps)",
  Days: "Dias",
  Celsius: "Celsius (°C)",
};

export const SENSOR_UNIT_OPTIONS = (
  Object.keys(SENSOR_UNIT_LABELS) as SensorChannelUnit[]
).map((value) => ({ value, label: SENSOR_UNIT_LABELS[value] }));

export const SENSOR_COMPARISON_LABELS: Record<SensorComparison, string> = {
  HigherIsWorse: "Quanto maior, pior",
  LowerIsWorse: "Quanto menor, pior",
};

export const SENSOR_COMPARISON_OPTIONS = [
  { value: "HigherIsWorse", label: SENSOR_COMPARISON_LABELS.HigherIsWorse },
  { value: "LowerIsWorse", label: SENSOR_COMPARISON_LABELS.LowerIsWorse },
];

export const SENSOR_EVENT_KIND_LABELS: Record<SensorEventKind, string> = {
  FirstRun: "Primeira coleta",
  StatusChanged: "Mudança de estado",
  SeverityChanged: "Mudança de severidade",
  AlertRaised: "Alerta aberto",
  AlertResolved: "Alerta resolvido",
  RunError: "Erro de coleta",
  Reset: "Estado zerado",
};

/** Tipos em que o backend EXIGE ao menos um limiar numérico (espelho do serviço). */
export const SENSOR_THRESHOLD_REQUIRED_TYPES: ReadonlySet<SensorType> = new Set<SensorType>([
  "DiskSpace",
  "Cpu",
  "Memory",
  "Uptime",
  "Ping",
  "HttpProbe",
  "HttpThroughput",
  "DnsLatency",
  "Bandwidth",
  "DiskIo",
]);

/** Tipos cujo limiar é decidido pelo SERVidor sem números (serviço/porta/processo). */
export const SENSOR_NO_THRESHOLD_TYPES: ReadonlySet<SensorType> = new Set<SensorType>([
  "Service",
  "Process",
]);

/**
 * Canal primário de cada tipo built-in (mesma tabela do servidor). Usado para
 * escolher a sparkline e para sugerir unidade/direção no formulário.
 */
export const SENSOR_PRIMARY_CHANNEL: Record<SensorType, string | null> = {
  DiskSpace: "free_percent",
  Cpu: "used_percent",
  Memory: "used_percent",
  Uptime: "uptime_seconds",
  Service: "running",
  Process: "running",
  Ping: "latency_avg_ms",
  TcpPort: "open",
  HttpProbe: "total_ms",
  HttpThroughput: "download_mbps",
  DnsLatency: "resolve_ms",
  Bandwidth: "rx_bps",
  DiskIo: "busy_percent",
  EventLogRate: "event_count",
  SmartStatus: "smart_status",
  CertificateExpiry: "days_to_expiry",
  DefenderStatus: "defender_real_time",
  BitLocker: "bitlocker_status",
  Script: null,
};

/** Unidade sugerida para o limiar quando o tipo é escolhido. */
export function defaultThresholdUnit(sensorType: SensorType): SensorChannelUnit {
  switch (sensorType) {
    case "DiskSpace":
    case "Cpu":
    case "Memory":
    case "DiskIo":
      return "Percent";
    case "Uptime":
      return "Seconds";
    case "Ping":
    case "HttpProbe":
    case "DnsLatency":
      return "Milliseconds";
    case "HttpThroughput":
      return "MegabitsPerSecond";
    case "Bandwidth":
      return "BytesPerSecond";
    case "EventLogRate":
      return "Count";
    case "CertificateExpiry":
      return "Days";
    case "SmartStatus":
    case "DefenderStatus":
    case "BitLocker":
      return "Count";
    case "TcpPort":
    case "Service":
    case "Process":
      return "Count";
    default:
      return "Count";
  }
}

/** Direção sugerida: espaço livre/uptime caem, o resto sobe. */
export function defaultComparison(sensorType: SensorType): SensorComparison {
  switch (sensorType) {
    case "DiskSpace":
    case "Uptime":
    // Dias até expirar: quanto menos dias, pior.
    case "CertificateExpiry":
      return "LowerIsWorse";
    default:
      return "HigherIsWorse";
  }
}

/** Sufixo curto da unidade (para limiares/valores). */
export function sensorUnitSuffix(unit: SensorChannelUnit): string {
  switch (unit) {
    case "Percent":
      return "%";
    case "Bytes":
      return " B";
    case "BytesPerSecond":
      return " B/s";
    case "Milliseconds":
      return " ms";
    case "Seconds":
      return " s";
    case "MegabitsPerSecond":
      return " Mbps";
    case "Days":
      return " d";
    case "Celsius":
      return " °C";
    default:
      return "";
  }
}

/** Número em pt-BR: inteiro quando >= 100, até 2 casas abaixo disso. */
export function formatSensorNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
  }).format(value);
}

/** Valor de canal pronto para exibição (unidade aplicada). */
export function formatSensorValue(
  value: number | null | undefined,
  unit: SensorChannelUnit,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "Bytes":
      return formatBytes(value);
    case "BytesPerSecond":
      return `${formatBytes(value)}/s`;
    case "Seconds":
      // Uptime em segundos vira "12d 4h" — em segundos crus não serve de nada.
      return value >= 60 ? formatUptime(value) : `${formatSensorNumber(value)} s`;
    case "Boolean":
      return value >= 1 ? "Sim" : "Não";
    default:
      return `${formatSensorNumber(value)}${sensorUnitSuffix(unit)}`;
  }
}

/* ------------------------------------------------------------------ *
 * Sensores de infraestrutura (F6b)
 *
 * Bandwidth/DiskIo já existiam; EventLogRate, SmartStatus,
 * CertificateExpiry, DefenderStatus e BitLocker entraram depois e têm
 * canais com valores que NÃO são números puros (SMART, Defender,
 * BitLocker) e datas (expiração de certificado). Sem estes mapas a aba
 * mostraria "128" onde o operador precisa ler "Bom".
 * ------------------------------------------------------------------ */

/** Canais textuais: o valor numérico vira um rótulo legível. */
export const SENSOR_ENUM_CHANNEL_VALUES: Record<string, Record<number, string>> = {
  smart_status: {
    0: "Desconhecido",
    1: "Bom",
    2: "Atenção",
    3: "Ruim",
  },
  defender_status: {
    0: "Desconhecido",
    1: "Ativo",
    2: "Inativo",
    3: "Desatualizado",
  },
  defender_real_time: {
    0: "Desligada",
    1: "Ligada",
  },
  bitlocker_status: {
    0: "Desconhecido",
    1: "Protegido",
    2: "Proteção desligada",
    3: "Proteção suspensa",
    4: "Criptografando",
    5: "Descriptografando",
  },
};

/** Canais que carregam data/hora (ISO em segundos desde a época). */
export const SENSOR_TIMESTAMP_CHANNELS: ReadonlySet<string> = new Set([
  "last_event_at",
  "expires_at",
]);

/**
 * Rótulo de um canal enum ("smart_status" = 1 -> "Bom"). Sem mapa conhecido
 * devolve null, e quem chamou cai no formatador numérico normal.
 */
export function sensorEnumChannelLabel(
  channelKey: string | null | undefined,
  value: number | null | undefined,
): string | null {
  if (!channelKey || value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const map = SENSOR_ENUM_CHANNEL_VALUES[channelKey];
  if (!map) return null;
  return map[Math.round(value)] ?? null;
}

/**
 * Valor de canal pronto para exibição: trata enums, datas e, no resto,
 * delega para formatSensorValue. O painel usa esta função porque o canal
 * primário de SMART/Defender/BitLocker é textual.
 */
export function formatSensorChannelValue(
  channelKey: string | null | undefined,
  value: number | null | undefined,
  unit: SensorChannelUnit,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const enumLabel = sensorEnumChannelLabel(channelKey, value);
  if (enumLabel) return enumLabel;
  if (channelKey && SENSOR_TIMESTAMP_CHANNELS.has(channelKey)) {
    return formatSensorTimestamp(value);
  }
  return formatSensorValue(value, unit);
}

/** Segundos desde a época -> data local pt-BR (ou "—" se inválido). */
export function formatSensorTimestamp(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Canais conhecidos por tipo novo. Só é FALLBACK: quando o servidor manda os
 * canais em `item.channels`, esses vencem (o agente pode declarar a menos).
 */
export const SENSOR_TYPE_CHANNEL_FALLBACK: Record<
  string,
  { key: string; label: string; unit: SensorChannelUnit }[]
> = {
  EventLogRate: [
    { key: "event_count", label: "Eventos", unit: "Count" },
    { key: "event_window_min", label: "Janela (min)", unit: "Count" },
    { key: "last_event_at", label: "Último evento", unit: "Seconds" },
  ],
  SmartStatus: [
    { key: "smart_status", label: "Estado SMART", unit: "Count" },
    { key: "temperature_c", label: "Temperatura", unit: "Celsius" },
    { key: "power_on_hours", label: "Horas ligado", unit: "Count" },
    { key: "reallocated_sect", label: "Setores realocados", unit: "Count" },
  ],
  CertificateExpiry: [
    { key: "days_to_expiry", label: "Dias até expirar", unit: "Days" },
    { key: "expires_at", label: "Expira em", unit: "Seconds" },
  ],
  DefenderStatus: [
    { key: "defender_status", label: "Estado", unit: "Count" },
    { key: "defender_real_time", label: "Proteção em tempo real", unit: "Count" },
    { key: "signature_age_days", label: "Idade das assinaturas", unit: "Days" },
  ],
  BitLocker: [
    { key: "bitlocker_status", label: "Estado", unit: "Count" },
    { key: "bitlocker_percent", label: "Criptografado", unit: "Percent" },
  ],
  Bandwidth: [
    { key: "rx_bps", label: "Recebido", unit: "BytesPerSecond" },
    { key: "tx_bps", label: "Enviado", unit: "BytesPerSecond" },
  ],
  DiskIo: [
    { key: "busy_percent", label: "Ocupação", unit: "Percent" },
    { key: "read_bps", label: "Leitura", unit: "BytesPerSecond" },
    { key: "write_bps", label: "Escrita", unit: "BytesPerSecond" },
    { key: "disk_latency_ms", label: "Latência", unit: "Milliseconds" },
  ],
};

/** Canais de um item: os do servidor vencem; o mapa local é só fallback. */
export function sensorItemChannels(
  item: Pick<SensorItem, "sensorType" | "channels">,
): { key: string; label: string; unit: SensorChannelUnit; isPrimary: boolean }[] {
  const declared = item.channels ?? [];
  if (declared.length > 0) return declared;
  const fallback = SENSOR_TYPE_CHANNEL_FALLBACK[item.sensorType] ?? [];
  return fallback.map((channel, index) => ({
    ...channel,
    isPrimary: index === 0,
  }));
}

/** Canais extras do BitLocker/Defender que só fazem sentido quando presentes. */
export function sensorChannelUnitFor(
  item: Pick<SensorItem, "sensorType" | "channels">,
  channelKey: string | null | undefined,
): SensorChannelUnit {
  if (!channelKey) return "Count";
  const found = sensorItemChannels(item).find((channel) => channel.key === channelKey);
  return found?.unit ?? "Count";
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

/** "há X" a partir de um timestamp — o painel usa useNowTick para re-renderizar. */
export function formatAgo(value: string | null | undefined, nowMs: number): string {
  if (!value) return "—";
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return "—";
  const diffMs = Math.max(0, nowMs - parsed);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "há instantes";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

/** Intervalo efetivo legível ("5 min", "1h", "30 s"). */
export function formatSensorInterval(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "herdado";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

/**
 * Paleta das linhas do gráfico. Usa os tokens do tema (funciona nos dois temas,
 * claro/escuro) e é compartilhada com a legenda do modal — a cor da legenda tem
 * de ser a MESMA da linha.
 */
export const SENSOR_CHART_COLORS = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-accent)",
  "var(--color-danger)",
] as const;

export function sensorChartColor(index: number): string {
  return SENSOR_CHART_COLORS[index % SENSOR_CHART_COLORS.length];
}

/** Descrição PT-BR dos limiares, respeitando a direção e a unidade. */
export function describeSensorThresholds(
  warningThreshold: number | null,
  criticalThreshold: number | null,
  unit: SensorChannelUnit,
  comparison: SensorComparison,
): string {
  const parts: string[] = [];
  if (warningThreshold !== null && warningThreshold !== undefined) {
    parts.push(`atenção ${formatSensorValue(warningThreshold, unit)}`);
  }
  if (criticalThreshold !== null && criticalThreshold !== undefined) {
    parts.push(`crítico ${formatSensorValue(criticalThreshold, unit)}`);
  }
  if (parts.length === 0) return "Sem limiares";
  const direction = comparison === "LowerIsWorse" ? "quanto menor, pior" : "quanto maior, pior";
  return `${parts.join(" · ")} (${direction})`;
}

/**
 * Série da sparkline do item: o canal primário declarado ou, nos sensores de
 * script, o primeiro canal que tenha amostras.
 */
export function sensorSparklineValues(item: SensorItem): number[] {
  const primary = item.primaryChannel;
  if (primary && item.sparkline[primary]?.length) return item.sparkline[primary];
  for (const channel of item.channels) {
    const values = item.sparkline[channel.key];
    if (values?.length) return values;
  }
  for (const values of Object.values(item.sparkline)) {
    if (values.length) return values;
  }
  return [];
}

// ── Editor de canais (sensor de script) ────────────────────────────────────

/**
 * Linha editável do editor de canais do sensor Script.
 *
 * O formulário edita linhas (key/label/unit/isPrimary) e converte para
 * SensorChannel[] só no submit: assim o operador adiciona/remove canais sem
 * lidar com JSON, e o contrato da API continua o mesmo.
 */
export interface SensorChannelRow {
  key: string;
  label: string;
  unit: SensorChannelUnit;
  isPrimary: boolean;
}

/** Linha em branco para o botão "Adicionar canal". */
export function emptySensorChannelRow(unit: SensorChannelUnit = "Count"): SensorChannelRow {
  return { key: "", label: "", unit, isPrimary: false };
}

/** Converte os canais de uma definição para as linhas do editor. */
export function sensorChannelRowsFromChannels(channels: SensorChannel[]): SensorChannelRow[] {
  return channels.map((channel) => ({
    key: channel.key,
    label: channel.label,
    unit: channel.unit,
    isPrimary: channel.isPrimary,
  }));
}

/**
 * Converte as linhas para o contrato da API.
 *
 * Regras de normalização (o servidor valida de novo, isto é só UX):
 * - chave vazia ou repetida é descartada;
 * - rótulo vazio cai para a chave;
 * - no máximo UM canal primário (o primeiro marcado ganha).
 */
export function sensorChannelsFromRows(rows: SensorChannelRow[]): SensorChannel[] {
  const channels: SensorChannel[] = [];
  const usedKeys = new Set<string>();
  let primaryTaken = false;
  for (const row of rows) {
    const key = row.key.trim();
    if (!key || usedKeys.has(key)) continue;
    usedKeys.add(key);
    const isPrimary = row.isPrimary && !primaryTaken;
    if (isPrimary) primaryTaken = true;
    channels.push({
      key,
      label: row.label.trim() || key,
      unit: row.unit,
      display: "chart",
      isPrimary,
    });
  }
  return channels;
}

/**
 * Validação do editor de canais (mensagem PT-BR pronta para o formulário).
 * Devolve null quando as linhas estão válidas.
 */
export function validateSensorChannelRows(rows: SensorChannelRow[]): string | null {
  if (rows.length === 0) {
    return "Sensor de script exige ao menos um canal de métrica declarado.";
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) return "Informe a chave de todos os canais.";
    if (/\s/.test(key)) return "A chave do canal não pode conter espaços.";
    if (seen.has(key)) return `Chave de canal duplicada: ${key}.`;
    seen.add(key);
  }
  return null;
}

// ── Sensores recomendados (CTA do estado vazio) ────────────────────────────

/**
 * Conjunto mínimo de sensores que cobre a saúde básica de uma máquina.
 *
 * Os valores espelham a recomendação do produto: disco livre < 15% (atenção) e
 * < 10% (crítico); CPU/memória > 85% (atenção) e > 95% (crítico); uptime < 24h
 * (atenção) pega reinícios inesperados. Todos no escopo do próprio agente.
 */
export function buildRecommendedSensorRequests(agentId: string): SensorUpsertRequest[] {
  const common: SensorUpsertRequest = {
    scopeType: AppApprovalScopeType.Agent,
    agentId,
    intervalSeconds: 0,
    timeoutSeconds: 10,
    failsBeforeAlert: 2,
    isActive: true,
  };
  return [
    {
      ...common,
      key: "disco",
      name: "Espaço em disco (todos os volumes)",
      description: "Alerta quando o espaço livre de qualquer volume ficar baixo.",
      sensorType: "DiskSpace",
      // Vazio = todos os volumes do dispositivo.
      target: null,
      warningThreshold: 15,
      criticalThreshold: 10,
      thresholdUnit: "Percent",
      comparison: "LowerIsWorse",
    },
    {
      ...common,
      key: "cpu",
      name: "CPU",
      description: "Uso de CPU acima do normal de forma sustentada.",
      sensorType: "Cpu",
      target: null,
      warningThreshold: 85,
      criticalThreshold: 95,
      thresholdUnit: "Percent",
      comparison: "HigherIsWorse",
    },
    {
      ...common,
      key: "memoria",
      name: "Memória",
      description: "Uso de memória acima do normal de forma sustentada.",
      sensorType: "Memory",
      target: null,
      warningThreshold: 85,
      criticalThreshold: 95,
      thresholdUnit: "Percent",
      comparison: "HigherIsWorse",
    },
    {
      ...common,
      key: "uptime",
      name: "Tempo ligado",
      description: "Reinício recente do dispositivo (uptime abaixo de 24h).",
      sensorType: "Uptime",
      target: null,
      warningThreshold: 86_400,
      criticalThreshold: null,
      thresholdUnit: "Seconds",
      comparison: "LowerIsWorse",
    },
  ];
}

/* ------------------------------------------------------------------ *
 * OptionsJson: histerese (sustainSamples) e reinício automático
 *
 * O contrato de SensorDefinition/SensorUpsertRequest NÃO tem colunas para
 * esses dois campos — eles viajam dentro de `optionsJson` (string JSON).
 * Como o mesmo JSON pode carregar chaves de outros recursos, a gravação
 * faz MERGE: lê o objeto atual, troca só as chaves nossas e devolve.
 * ------------------------------------------------------------------ */

export const MIN_SUSTAIN_SAMPLES = 1;
export const MAX_SUSTAIN_SAMPLES = 50;
export const DEFAULT_SUSTAIN_SAMPLES = 1;

/** Chaves que a aba "Sensores" gerencia dentro de optionsJson. */
export const SENSOR_OPTION_KEYS = ["sustainSamples", "restartIfStopped"] as const;

export interface SensorOptions {
  /**
   * Histerese: quantas amostras ruins CONSECUTIVAS antes de escalar para um
   * estado pior. 1 = sem histerese. A PRIMEIRA falha e a recuperação sempre
   * valem imediatamente; só a piora espera N amostras.
   */
  sustainSamples: number;
  /** Só para sensores de Serviço: reiniciar o serviço quando estiver parado. */
  restartIfStopped: boolean;
}

/** Lê o objeto de optionsJson; JSON inválido/vazio vira objeto vazio. */
export function parseSensorOptionsJson(raw: string | null | undefined): Record<string, unknown> {
  const text = (raw ?? "").trim();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/** Normaliza sustainSamples para o intervalo válido (1..50). */
export function normalizeSustainSamples(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SUSTAIN_SAMPLES;
  const rounded = Math.round(parsed);
  if (rounded < MIN_SUSTAIN_SAMPLES) return MIN_SUSTAIN_SAMPLES;
  if (rounded > MAX_SUSTAIN_SAMPLES) return MAX_SUSTAIN_SAMPLES;
  return rounded;
}

/** Opções efetivas do sensor, com os padrões aplicados. */
export function sensorOptionsFromJson(raw: string | null | undefined): SensorOptions {
  const parsed = parseSensorOptionsJson(raw);
  return {
    sustainSamples: normalizeSustainSamples(parsed.sustainSamples ?? DEFAULT_SUSTAIN_SAMPLES),
    restartIfStopped: parsed.restartIfStopped === true,
  };
}

/**
 * Grava as opções preservando as demais chaves do JSON. Devolve `null` quando
 * o resultado fica vazio (sem opções), em vez de "{}".
 */
export function mergeSensorOptionsJson(
  raw: string | null | undefined,
  options: Partial<SensorOptions>,
): string | null {
  const merged: Record<string, unknown> = { ...parseSensorOptionsJson(raw) };
  if (options.sustainSamples !== undefined) {
    merged.sustainSamples = normalizeSustainSamples(options.sustainSamples);
  }
  if (options.restartIfStopped !== undefined) {
    merged.restartIfStopped = options.restartIfStopped === true;
  }
  return Object.keys(merged).length === 0 ? null : JSON.stringify(merged);
}

/** Texto de ajuda da histerese — o mesmo no formulário e no detalhe. */
export function describeSustainSamples(samples: number): string {
  const normalized = normalizeSustainSamples(samples);
  if (normalized <= 1) return "Sem histerese: a primeira amostra ruim já alerta.";
  return `Escala para um estado pior só após ${normalized} amostras ruins consecutivas. A primeira falha e a recuperação valem na hora.`;
}



/* -------------------------------------------------------------------------- */
/* Exportação CSV do gráfico                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Separador de campo. O CSV sai com ponto e vírgula porque o alvo é o Excel em
 * pt-BR, onde a vírgula é o separador decimal — usar "," aqui quebraria os
 * números na planilha.
 */
export const CSV_SEPARATOR = ";";

/** Escapa um campo do CSV (aspas duplicadas e campo entre aspas quando precisa). */
export function escapeCsvField(value: string): string {
  const text = value ?? "";
  if (text.includes(String.fromCharCode(34))) {
    return quoteCsv(text.replace(/"/g, String.fromCharCode(34, 34)));
  }
  if (text.includes(CSV_SEPARATOR) || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return quoteCsv(text);
  }
  return text;
}

function quoteCsv(text: string): string {
  return String.fromCharCode(34) + text + String.fromCharCode(34);
}

/**
 * Nome de arquivo sugerido para o download: identifica o sensor, a janela
 * exportada e o alvo (sem acentos/espaços, que atrapalham no sistema de arquivos).
 */
export function sensorCsvFileName(series: SensorSeries, sensorName?: string | null): string {
  const slug = (value: string): string =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  const name = slug(sensorName ?? "") || "sensor";
  const target = slug(series.targetKey ?? "");
  const from = slug(series.from ?? "");
  const to = slug(series.to ?? "");
  const window = from && to ? from + "_" + to : "janela";
  return target
    ? "sensor-" + name + "-" + target + "-" + window + ".csv"
    : "sensor-" + name + "-" + window + ".csv";
}

/**
 * Monta o CSV da série exibida: uma linha por instante e uma coluna por canal
 * (além de `min`/`max` do canal quando o servidor agregou a janela).
 *
 * Exporta apenas o que está na tela: a série já vem recortada pela janela
 * (`from`/`to`) e pelos canais/filtros escolhidos no gráfico.
 */
export function sensorSeriesToCsv(series: SensorSeries): string {
  const channels = series.channels ?? [];
  const first = channels.find((channel) => channel.points.length > 0);
  if (!first) return "";

  // Os canais compartilham o mesmo eixo de tempo: o primeiro com pontos vira a
  // espinha dorsal e os demais são casados pelo instante.
  const stamps = first.points.map((point) => point.t);
  const index = new Map<string, Map<string, SensorSeriesPointLike>>();
  for (const channel of channels) {
    const byStamp = new Map<string, SensorSeriesPointLike>();
    for (const point of channel.points) byStamp.set(point.t, point);
    index.set(channel.key, byStamp);
  }

  const header = ["instante"];
  for (const channel of channels) {
    header.push(channel.key || channel.label);
    // Só cria colunas de agregação quando o servidor realmente as preencheu.
    if (channel.points.some((point) => point.min !== null)) header.push(channel.key + "_min");
    if (channel.points.some((point) => point.max !== null)) header.push(channel.key + "_max");
  }

  const lines = [header.map(escapeCsvField).join(CSV_SEPARATOR)];
  for (const stamp of stamps) {
    const cells = [stamp];
    for (const channel of channels) {
      const point = index.get(channel.key)?.get(stamp) ?? null;
      cells.push(exportedNumber(point?.v ?? null));
      if (header.includes(channel.key + "_min")) cells.push(exportedNumber(point?.min ?? null));
      if (header.includes(channel.key + "_max")) cells.push(exportedNumber(point?.max ?? null));
    }
    lines.push(cells.map(escapeCsvField).join(CSV_SEPARATOR));
  }
  return lines.join("\r\n");
}

/** Ponto da série (subconjunto usado na exportação). */
interface SensorSeriesPointLike {
  t: string;
  v: number | null;
  min: number | null;
  max: number | null;
}

/**
 * Número para o CSV: vazio quando não houve medição (não usar 0, que viraria
 * uma queda falsa no gráfico da planilha) e vírgula decimal para o Excel pt-BR.
 */
function exportedNumber(value: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(value).replace(".", ",");
}

/** Dispara o download de um texto como arquivo (Blob + link temporário). */
export function downloadTextFile(
  fileName: string,
  contents: string,
  mimeType = "text/csv;charset=utf-8",
): void {
  const blob = new Blob(["\uFEFF" + contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Sem o revoke o blob fica na memória até o unload da página.
  URL.revokeObjectURL(url);
}
