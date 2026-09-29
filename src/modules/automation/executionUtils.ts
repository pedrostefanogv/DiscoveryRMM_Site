import {
  AutomationExecutionSourceType,
  AutomationExecutionStatus,
  type AutomationExecutionReport,
} from "@/api/types";

export type ExecutionBadgeColor =
  | "slate"
  | "primary"
  | "success"
  | "danger"
  | "warning";

const STATUS_BY_NAME: Record<string, AutomationExecutionStatus> = {
  dispatched: AutomationExecutionStatus.Dispatched,
  acknowledged: AutomationExecutionStatus.Acknowledged,
  completed: AutomationExecutionStatus.Completed,
  failed: AutomationExecutionStatus.Failed,
  cancelled: AutomationExecutionStatus.Cancelled,
  canceled: AutomationExecutionStatus.Cancelled,
};

const SOURCE_BY_NAME: Record<string, AutomationExecutionSourceType> = {
  runnow: AutomationExecutionSourceType.RunNow,
  run_now: AutomationExecutionSourceType.RunNow,
  scheduled: AutomationExecutionSourceType.Scheduled,
  forcesync: AutomationExecutionSourceType.ForceSync,
  agentmanual: AutomationExecutionSourceType.AgentManual,
  softwareupdate: AutomationExecutionSourceType.SoftwareUpdate,
  softwareuninstall: AutomationExecutionSourceType.SoftwareUninstall,
};

/**
 * A API pode devolver o status como número (enum) ou string ("Dispatched"),
 * dependendo do serializador/cache. Normalizar aqui evita comparações que
 * silenciosamente nunca casam (bug do auto-refresh da página de operações).
 */
export function normalizeExecutionStatus(
  value: unknown,
): AutomationExecutionStatus | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 4
      ? (value as AutomationExecutionStatus)
      : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 4
        ? (numeric as AutomationExecutionStatus)
        : null;
    }

    return STATUS_BY_NAME[trimmed.toLowerCase()] ?? null;
  }

  return null;
}

/** Execuções ainda em voo (dispatch/ack) — alimentam o polling e os KPIs. */
export function isExecutionPending(value: unknown): boolean {
  const status = normalizeExecutionStatus(value);
  return (
    status === AutomationExecutionStatus.Dispatched ||
    status === AutomationExecutionStatus.Acknowledged
  );
}

export function executionStatusMeta(value: unknown): {
  label: string;
  color: ExecutionBadgeColor;
  pending: boolean;
} {
  switch (normalizeExecutionStatus(value)) {
    case AutomationExecutionStatus.Dispatched:
      return { label: "Dispatched", color: "slate", pending: true };
    case AutomationExecutionStatus.Acknowledged:
      return { label: "Acknowledged", color: "primary", pending: true };
    case AutomationExecutionStatus.Completed:
      return { label: "Completed", color: "success", pending: false };
    case AutomationExecutionStatus.Failed:
      return { label: "Failed", color: "danger", pending: false };
    case AutomationExecutionStatus.Cancelled:
      return { label: "Cancelada", color: "slate", pending: false };
    default:
      return { label: String(value ?? "Desconhecido"), color: "warning", pending: false };
  }
}

export function normalizeExecutionSource(
  value: unknown,
): AutomationExecutionSourceType | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 5
      ? (value as AutomationExecutionSourceType)
      : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 5
        ? (numeric as AutomationExecutionSourceType)
        : null;
    }

    const key = trimmed.toLowerCase().replace(/[-_\s]/g, "");
    return SOURCE_BY_NAME[key] ?? SOURCE_BY_NAME[trimmed.toLowerCase()] ?? null;
  }

  return null;
}

export function executionSourceLabel(value: unknown): string {
  switch (normalizeExecutionSource(value)) {
    case AutomationExecutionSourceType.RunNow:
      return "RunNow";
    case AutomationExecutionSourceType.Scheduled:
      return "Scheduled";
    case AutomationExecutionSourceType.ForceSync:
      return "ForceSync";
    case AutomationExecutionSourceType.AgentManual:
      return "AgentManual";
    case AutomationExecutionSourceType.SoftwareUpdate:
      return "SoftwareUpdate";
    case AutomationExecutionSourceType.SoftwareUninstall:
      return "SoftwareUninstall";
    default:
      return String(value ?? "Desconhecido");
  }
}

/**
 * Nome amigável do alvo da execução. Prefere os nomes resolvidos pela API
 * (funcionam para tarefas já excluídas) e cai no GUID quando indisponível.
 */
export function executionTargetName(
  report: AutomationExecutionReport,
): { kind: "task" | "script" | "none"; name: string | null; id: string | null } {
  if (report.taskId) {
    return {
      kind: "task",
      name: report.taskName ?? null,
      id: report.taskId,
    };
  }
  if (report.scriptId) {
    return {
      kind: "script",
      name: report.scriptName ?? null,
      id: report.scriptId,
    };
  }
  return { kind: "none", name: null, id: null };
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Latência entre o dispatch e o ack do agent (ms). */
export function ackLatencyMs(report: AutomationExecutionReport): number | null {
  const created = toTimestamp(report.createdAt);
  const ack = toTimestamp(report.acknowledgedAt);
  if (created === null || ack === null || ack < created) return null;
  return ack - created;
}

/**
 * Tempo total até o resultado chegar. Enquanto não há resultado, mede do
 * dispatch até o ack (tempo decorrido parcial).
 */
export function executionDurationMs(
  report: AutomationExecutionReport,
  now: number = Date.now(),
): number | null {
  const created = toTimestamp(report.createdAt);
  if (created === null) return null;

  const result = toTimestamp(report.resultReceivedAt);
  if (result !== null && result >= created) return result - created;

  if (!isExecutionPending(report.status)) return null;

  const ack = toTimestamp(report.acknowledgedAt) ?? created;
  const reference = now > ack ? now : ack;
  return reference - created;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms) || ms < 0) return "-";
  if (ms < 1000) return `${ms} ms`;

  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1).replace(".", ",")} s`;

  const minutes = Math.floor(seconds / 60);
  const restSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    return restSeconds > 0 ? `${minutes} min ${restSeconds} s` : `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours} h ${restMinutes} min` : `${hours} h`;
}

export interface ExecutionSummary {
  total: number;
  dispatched: number;
  acknowledged: number;
  completed: number;
  failed: number;
  cancelled: number;
  pending: number;
  /** Sucesso sobre execuções finalizadas (0 quando nenhuma finalizou). */
  successRate: number;
}

export function summarizeExecutions(
  reports: readonly AutomationExecutionReport[],
): ExecutionSummary {
  const summary: ExecutionSummary = {
    total: reports.length,
    dispatched: 0,
    acknowledged: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    pending: 0,
    successRate: 0,
  };

  for (const report of reports) {
    switch (normalizeExecutionStatus(report.status)) {
      case AutomationExecutionStatus.Dispatched:
        summary.dispatched += 1;
        break;
      case AutomationExecutionStatus.Acknowledged:
        summary.acknowledged += 1;
        break;
      case AutomationExecutionStatus.Completed:
        summary.completed += 1;
        break;
      case AutomationExecutionStatus.Failed:
        summary.failed += 1;
        break;
      case AutomationExecutionStatus.Cancelled:
        summary.cancelled += 1;
        break;
      default:
        break;
    }
  }

  summary.pending = summary.dispatched + summary.acknowledged;
  const finished = summary.completed + summary.failed;
  summary.successRate = finished === 0 ? 0 : summary.completed / finished;
  return summary;
}

export interface ExecutionFilter {
  /** Busca livre sobre nome de tarefa/script, correlation, erro e GUIDs. */
  search?: string;
  onlyFailures?: boolean;
  /** Somente execuções ainda em voo (dispatch/ack). */
  onlyPending?: boolean;
}

export function filterExecutions(
  reports: readonly AutomationExecutionReport[],
  filter: ExecutionFilter,
): AutomationExecutionReport[] {
  const term = filter.search?.trim().toLowerCase() ?? "";
  const onlyFailures = filter.onlyFailures === true;
  const onlyPending = filter.onlyPending === true;

  if (!term && !onlyFailures && !onlyPending) return [...reports];

  return reports.filter((report) => {
    if (
      onlyFailures &&
      normalizeExecutionStatus(report.status) !== AutomationExecutionStatus.Failed
    ) {
      return false;
    }

    if (onlyPending && !isExecutionPending(report.status)) {
      return false;
    }

    if (!term) return true;

    const target = executionTargetName(report);
    const haystack = [
      report.taskName,
      report.scriptName,
      target.name,
      report.correlationId,
      report.errorMessage,
      report.taskId,
      report.scriptId,
      report.commandId,
      executionSourceLabel(report.sourceType),
      executionStatusMeta(report.status).label,
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();

    return haystack.includes(term);
  });
}

/**
 * Mitiga CSV injection: Excel/Sheets tratam valores iniciados por =, +, -, @,
 * TAB ou CR como fórmula. Prefixar com apóstrofo mantém o texto inerte.
 */
function sanitizeCsvFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Números não levam a proteção (evita transformar exit code em texto).
  const text = typeof value === "string" ? sanitizeCsvFormula(value) : String(value);
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * CSV (separador ";" para o Excel pt-BR) do histórico exibido. Inclui os nomes
 * já resolvidos para o arquivo ser útil fora do sistema.
 */
export function buildExecutionsCsv(
  reports: readonly AutomationExecutionReport[],
): string {
  const header = [
    "id",
    "commandId",
    "status",
    "origem",
    "tipo",
    "tarefa",
    "script",
    "criadoEm",
    "ackEm",
    "resultadoEm",
    "duracaoMs",
    "exitCode",
    "erro",
    "correlationId",
  ];

  const rows = reports.map((report) => {
    const target = executionTargetName(report);
    const duration = executionDurationMs(report);
    return [
      report.id,
      report.commandId,
      executionStatusMeta(report.status).label,
      executionSourceLabel(report.sourceType),
      target.kind === "none" ? "" : target.kind,
      report.taskName ?? (target.kind === "task" ? target.id : ""),
      report.scriptName ?? (target.kind === "script" ? target.id : ""),
      report.createdAt,
      report.acknowledgedAt,
      report.resultReceivedAt,
      duration === null ? "" : duration,
      report.exitCode,
      report.errorMessage,
      report.correlationId,
    ]
      .map(csvCell)
      .join(";");
  });

  return [header.join(";"), ...rows].join("\r\n");
}

/**
 * Retry de uma execução: reenvia a operação usando o mesmo alvo. Execuções de
 * force sync não têm alvo reexecutável (são sincronizações técnicas).
 */
export function canRetryExecution(report: AutomationExecutionReport): boolean {
  return Boolean(report.taskId || report.scriptId);
}
