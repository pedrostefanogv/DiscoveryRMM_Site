import {
  AppApprovalScopeType,
  AppInstallationType,
  AutomationNotificationMode,
  AutomationTaskActionType,
  AutomationToastTiming,
} from "@/api/types";

export function buildCorrelationId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function actionLabel(value: unknown): string {
  if (
    value === AutomationTaskActionType.InstallPackage ||
    value === "InstallPackage"
  )
    return "InstallPackage";
  if (
    value === AutomationTaskActionType.UpdatePackage ||
    value === "UpdatePackage"
  )
    return "UpdatePackage";
  if (value === AutomationTaskActionType.RunScript || value === "RunScript")
    return "RunScript";
  if (
    value === AutomationTaskActionType.CustomCommand ||
    value === "CustomCommand"
  )
    return "CustomCommand";
  if (
    value === AutomationTaskActionType.RemovePackage ||
    value === "RemovePackage"
  )
    return "RemovePackage";
  if (
    value === AutomationTaskActionType.UpdateOrInstallPackage ||
    value === "UpdateOrInstallPackage"
  )
    return "UpdateOrInstallPackage";
  return String(value ?? "-");
}

export function scopeLabel(value: unknown): string {
  if (value === AppApprovalScopeType.Global || value === "Global")
    return "Global";
  if (value === AppApprovalScopeType.Client || value === "Client")
    return "Client";
  if (value === AppApprovalScopeType.Site || value === "Site") return "Site";
  if (value === AppApprovalScopeType.Agent || value === "Agent") return "Agent";
  return String(value ?? "-");
}

export function normalizeActionType(value: unknown): AutomationTaskActionType {
  if (typeof value === "number") return value as AutomationTaskActionType;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AutomationTaskActionType;
    if (value === "InstallPackage")
      return AutomationTaskActionType.InstallPackage;
    if (value === "UpdatePackage")
      return AutomationTaskActionType.UpdatePackage;
    if (value === "RunScript") return AutomationTaskActionType.RunScript;
    if (value === "CustomCommand")
      return AutomationTaskActionType.CustomCommand;
    if (value === "RemovePackage")
      return AutomationTaskActionType.RemovePackage;
    if (value === "UpdateOrInstallPackage")
      return AutomationTaskActionType.UpdateOrInstallPackage;
  }
  return AutomationTaskActionType.RunScript;
}

export function normalizeScopeType(value: unknown): AppApprovalScopeType {
  if (typeof value === "number") return value as AppApprovalScopeType;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AppApprovalScopeType;
    if (value === "Global") return AppApprovalScopeType.Global;
    if (value === "Client") return AppApprovalScopeType.Client;
    if (value === "Site") return AppApprovalScopeType.Site;
    if (value === "Agent") return AppApprovalScopeType.Agent;
  }
  return AppApprovalScopeType.Global;
}

export function normalizeInstallationType(value: unknown): AppInstallationType {
  if (typeof value === "number") return value as AppInstallationType;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AppInstallationType;
    if (value === "Winget") return AppInstallationType.Winget;
    if (value === "Chocolatey") return AppInstallationType.Chocolatey;
    if (value === "Custom") return AppInstallationType.Custom;
    if (value === "winget") return AppInstallationType.Winget;
    if (value === "chocolatey" || value === "choco")
      return AppInstallationType.Chocolatey;
    if (value === "custom") return AppInstallationType.Custom;
  }
  return AppInstallationType.Winget;
}

export function normalizeNotificationMode(
  value: unknown,
): AutomationNotificationMode {
  if (typeof value === "number") return value as AutomationNotificationMode;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AutomationNotificationMode;
    if (value === "Silent") return AutomationNotificationMode.Silent;
    if (value === "Prompt") return AutomationNotificationMode.Prompt;
    if (value === "Toast") return AutomationNotificationMode.Toast;
  }
  return AutomationNotificationMode.Silent;
}

export function normalizeToastTiming(value: unknown): AutomationToastTiming {
  if (typeof value === "number") return value as AutomationToastTiming;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric as AutomationToastTiming;
    if (value === "Before") return AutomationToastTiming.Before;
    if (value === "After") return AutomationToastTiming.After;
  }
  return AutomationToastTiming.After;
}

/**
 * Resolve o modo efetivo de uma tarefa. Quando a resposta não traz
 * `notificationMode` (API/cache antigos), deriva de `requiresApproval` para não
 * exibir "Silenciosa" numa tarefa que na verdade pede o Prompt.
 */
export function notificationModeFromTask(
  value: unknown,
  requiresApproval?: boolean,
): AutomationNotificationMode {
  if (value === null || value === undefined || value === "") {
    return requiresApproval
      ? AutomationNotificationMode.Prompt
      : AutomationNotificationMode.Silent;
  }
  return normalizeNotificationMode(value);
}

export function notificationModeLabel(value: unknown): string {
  switch (normalizeNotificationMode(value)) {
    case AutomationNotificationMode.Prompt:
      return "Prompt PSADT (Continuar/Adiar)";
    case AutomationNotificationMode.Toast:
      return "Toast simples";
    default:
      return "Silencioso";
  }
}

export function toastTimingLabel(value: unknown): string {
  return normalizeToastTiming(value) === AutomationToastTiming.Before
    ? "Antes de executar"
    : "Após a conclusão";
}


// ── Descrição de cron (5 campos, dialeto robfig/cron) ───────────────────────
const CRON_WEEKDAY_NAMES = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const CRON_MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function pad2(value: string | number): string {
  return String(value).padStart(2, "0");
}

function isCronNumber(field: string): boolean {
  return /^\d+$/.test(field);
}

// O cron aceita 0 ou 7 para domingo.
function cronWeekdayName(value: string): string | undefined {
  const n = Number(value);
  return CRON_WEEKDAY_NAMES[n === 7 ? 0 : n];
}

// "toda segunda-feira" / "todo sábado" / "todo domingo".
function weekdayPhrase(name: string): string {
  return name.endsWith("feira") ? `toda ${name}` : `todo ${name}`;
}

function describeCronWeekdays(field: string): string | null {
  if (isCronNumber(field)) {
    const n = Number(field);
    if (n < 0 || n > 7) return null;
    return weekdayPhrase(cronWeekdayName(field)!);
  }
  const range = field.match(/^(\d)-(\d)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from < 0 || to > 7 || from >= to) return null;
    return `de ${cronWeekdayName(range[1])} a ${cronWeekdayName(range[2])}`;
  }
  const step = field.match(/^\*\/(\d+)$/);
  if (step) {
    const n = Number(step[1]);
    return n >= 1 && n <= 6 ? `a cada ${n} dias da semana` : null;
  }
  const list = field.split(",");
  if (list.length > 1 && list.every((item) => isCronNumber(item) && Number(item) >= 0 && Number(item) <= 7)) {
    return list.map((item) => weekdayPhrase(cronWeekdayName(item)!)).join(", ");
  }
  return null;
}

function describeCronMonthDays(field: string): string | null {
  if (isCronNumber(field)) {
    const n = Number(field);
    if (n < 1 || n > 31) return null;
    return `${n}`;
  }
  const range = field.match(/^(\d+)-(\d+)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from < 1 || to > 31 || from >= to) return null;
    return `${from} ao ${to}`;
  }
  const step = field.match(/^\*\/(\d+)$/);
  if (step) {
    const n = Number(step[1]);
    return n >= 1 && n <= 31 ? `a cada ${n} dias` : null;
  }
  return null;
}

function describeCronMonths(field: string): string | null {
  const name = (value: string) => CRON_MONTH_NAMES[Number(value) - 1];
  if (isCronNumber(field)) {
    const n = Number(field);
    return n >= 1 && n <= 12 ? name(field) : null;
  }
  const range = field.match(/^(\d+)-(\d+)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from < 1 || to > 12 || from >= to) return null;
    return `${name(range[1])} a ${name(range[2])}`;
  }
  const list = field.split(",");
  if (list.length > 1 && list.every((item) => isCronNumber(item) && Number(item) >= 1 && Number(item) <= 12)) {
    return list.map(name).join(", ");
  }
  return null;
}

function describeCronTime(minute: string, hour: string): string | null {
  const minuteStep = minute.match(/^\*\/(\d+)$/);
  if (minuteStep && hour === "*") {
    const n = Number(minuteStep[1]);
    if (n < 1 || n > 59) return null;
    return n === 1 ? "a cada minuto" : `a cada ${n} minutos`;
  }
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (isCronNumber(minute) && hourStep) {
    const n = Number(hourStep[1]);
    if (n < 1 || n > 23) return null;
    return `a cada ${n} horas (no minuto ${pad2(minute)})`;
  }
  if (minute === "*" && hour === "*") return "a cada minuto";
  if (isCronNumber(minute) && hour === "*") return `a cada hora (no minuto ${pad2(minute)})`;
  if (isCronNumber(minute) && isCronNumber(hour)) {
    if (Number(minute) > 59 || Number(hour) > 23) return null;
    return `às ${pad2(hour)}:${pad2(minute)}`;
  }
  return null;
}

/**
 * Traduz uma expressão cron de 5 campos (minuto hora dia-do-mês mês
 * dia-da-semana) para uma frase em português. Serve de feedback ao usuário
 * enquanto ele monta o agendamento. Retorna uma mensagem de erro amigável
 * quando a expressão não é reconhecida.
 */
export function describeCron(expr: string): string {
  const raw = String(expr ?? "").trim();
  if (!raw) return "Informe uma expressão cron para ver a descrição.";
  const fields = raw.split(/\s+/);
  if (fields.length !== 5) {
    return "Expressão incompleta — o cron deve ter 5 campos (minuto hora dia do mês mês dia da semana).";
  }
  const [minute, hour, monthDay, month, weekday] = fields;

  const time = describeCronTime(minute, hour);
  if (!time) return "Expressão inválida — confira minuto (0-59) e hora (0-23).";

  const dateParts: string[] = [];
  const weekdays = weekday === "*" ? null : describeCronWeekdays(weekday);
  const monthDays = monthDay === "*" ? null : describeCronMonthDays(monthDay);
  if (weekday !== "*" && !weekdays) return "Expressão inválida — confira o dia da semana (0-6).";
  if (monthDay !== "*" && !monthDays) return "Expressão inválida — confira o dia do mês (1-31).";

  const months = month === "*" ? null : describeCronMonths(month);
  if (month !== "*" && !months) return "Expressão inválida — confira o mês (1-12).";

  if (!weekdays && !monthDays) {
    dateParts.push(months ? `todos os dias de ${months}` : "todos os dias");
  } else if (weekdays && monthDays) {
    // No cron padrão, dia-do-mês e dia-da-semana restritos se combinam com OU.
    dateParts.push(`${weekdays} ou no dia ${monthDays} do mês`);
  } else if (weekdays) {
    dateParts.push(weekdays);
  } else {
    dateParts.push(`no dia ${monthDays} do mês`);
  }
  if (months && (weekdays || monthDays)) {
    dateParts.push(`em ${months}`);
  }

  return `Executa ${time}, ${dateParts.join(" e ")}.`;
}

export interface WingetDecisionInfo {
  skip: boolean;
  benign: boolean;
  reason: string | null;
  decidedBy: string | null;
}

/**
 * Extrai a decisão do winget do metadata de resultado do agent
 * (`resultMetadataJson` -> `wingetDecision`). Serve para explicar na UI por que
 * uma execução não instalou nada (ex.: pacote já instalado) e qual fonte decidiu
 * ("winget" ou "inventory-cache" quando o winget está indisponível).
 */
export function wingetDecisionFromMetadata(
  metadataJson: string | null | undefined,
): WingetDecisionInfo | null {
  if (!metadataJson) return null;
  try {
    const parsed = JSON.parse(metadataJson) as {
      wingetDecision?: unknown;
    } | null;
    const decision = parsed?.wingetDecision;
    if (!decision || typeof decision !== "object") return null;
    const record = decision as Record<string, unknown>;
    return {
      skip: record.skip === true,
      benign: record.benign === true,
      reason: typeof record.reason === "string" ? record.reason : null,
      decidedBy: typeof record.decidedBy === "string" ? record.decidedBy : null,
    };
  } catch {
    return null;
  }
}
