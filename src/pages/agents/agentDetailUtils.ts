import { formatBytes as formatBytesCanonical, formatDateTime as formatDateTimeCanonical } from '@/utils/format';
import toast from 'react-hot-toast';

export interface InventoryPrinter {
  name: string;
  driverName: string | null;
  portName: string | null;
  printerStatus: string | null;
  isDefault: boolean;
  isNetworkPrinter: boolean;
  shared: boolean;
  shareName: string | null;
  location: string | null;
}

export function formatBytes(bytes: number | null): string {
  return formatBytesCanonical(bytes);
}

export function formatDate(date: string | null): string {
  return formatDateTimeCanonical(date);
}

export function formatSocketFamily(family: string | null): string {
  if (!family) return "\u2014";
  if (family === "2") return "IPv4";
  if (family === "23") return "IPv6";
  return family;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function asBoolean(value: unknown): boolean {
  return value === true;
}

export function normalizePrinterEntries(value: unknown): InventoryPrinter[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((printer) => ({
    name: asNullableString(printer.name) ?? "Impressora sem nome",
    driverName: asNullableString(printer.driverName),
    portName: asNullableString(printer.portName),
    printerStatus: asNullableString(printer.printerStatus),
    isDefault: asBoolean(printer.isDefault),
    isNetworkPrinter: asBoolean(printer.isNetworkPrinter),
    shared: asBoolean(printer.shared),
    shareName: asNullableString(printer.shareName),
    location: asNullableString(printer.location),
  }));
}

export function parseInventoryPrinters(
  inventoryRaw: string | null,
  topLevelPrinters?: unknown,
  topLevelInventoryRaw?: unknown,
): InventoryPrinter[] {
  const fromTopLevel = normalizePrinterEntries(topLevelPrinters);
  if (fromTopLevel.length > 0) return fromTopLevel;

  const rawCandidate = topLevelInventoryRaw ?? inventoryRaw;
  if (!rawCandidate) return [];

  let parsed: unknown = rawCandidate;
  if (typeof rawCandidate === "string") {
    try {
      parsed = JSON.parse(rawCandidate);
    } catch {
      return [];
    }
  }

  if (!isRecord(parsed)) return [];
  const components = parsed.components;
  if (!isRecord(components)) return [];

  return normalizePrinterEntries(components.printers);
}

export function printerStatusColor(
  status: string | null,
): "success" | "warning" | "danger" | "slate" {
  if (!status) return "slate";
  const normalized = status.toLowerCase();
  if (normalized.includes("ready") || normalized.includes("pronta"))
    return "success";
  if (
    normalized.includes("error") ||
    normalized.includes("erro") ||
    normalized.includes("offline")
  )
    return "danger";
  if (
    normalized.includes("warn") ||
    normalized.includes("warning") ||
    normalized.includes("paus")
  )
    return "warning";
  return "slate";
}


// ── Inicialização do Windows / Tarefas agendadas ────────

export function startupItemStatusColor(
  status: string | null,
): "success" | "danger" | "slate" {
  if (!status) return "slate";
  return status.toLowerCase() === "disabled" ? "danger" : "success";
}

export function startupItemStatusLabel(status: string | null): string {
  if (!status) return "Desconhecido";
  return status.toLowerCase() === "disabled" ? "Desabilitado" : "Habilitado";
}

/**
 * Rótulo da conta dona do item de inicialização. O agent preenche Username
 * para itens de outros usuários (HKU\<SID>); quando vazio, derivamos do
 * escopo da origem.
 */
export function startupItemUserLabel(item: {
  username?: string | null;
  source?: string | null;
  type?: string | null;
}): string {
  const username = (item.username ?? "").trim();
  if (username) return username;

  const source = (item.source ?? "").toLowerCase();
  if (item.type === "service" || source.startsWith("hklm") || source.includes("todos os usuários")) {
    return "Todos os usuários";
  }
  if (source.startsWith("hkcu") || source.includes("pasta startup (usuário)")) {
    return "Usuário atual";
  }
  return "—";
}

export function scheduledTaskTriggerLabel(triggerType: string | null): string {
  switch ((triggerType ?? "").toLowerCase()) {
    case "boot":
      return "Na inicialização";
    case "logon":
      return "No logon";
    case "daily":
      return "Diário";
    case "weekly":
      return "Semanal";
    case "once":
      return "Uma vez";
    case "idle":
      return "Quando ocioso";
    case "event":
      return "Por evento";
    case "monthly":
      return "Mensal";
    case "calendar":
      return "Calendário";
    case "registration":
      return "No registro da tarefa";
    case "session":
      return "Mudança de estado da sessão";
    case "wnf":
      return "Mudança de estado do sistema (WNF)";
    case "custom":
      return "Gatilho personalizado";
    case "none":
      return "Sem gatilho (execução sob demanda)";
    default: {
      const raw = (triggerType ?? "").trim();
      if (!raw || raw.toLowerCase() === "other") return "Outro";
      const cleaned = raw
        .replace(/^MSFT_Task/i, "")
        .replace(/Trigger$/i, "")
        .replace(/([a-z])([A-Z])/g, "$1 $2");
      return cleaned || "Outro";
    }
  }
}

/**
 * O agent emite as descrições de gatilho em ASCII — a saída do PowerShell
 * passa pelo code page OEM do serviço, então acentos podem corromper no
 * caminho. Esta normalização devolve o texto acentuado para a UI.
 */
export function normalizeScheduledTaskTriggerDesc(
  desc: string | null | undefined,
): string {
  if (!desc) return "";

  // Agentes antigos emitiam a classe CIM crua (ex.: "MSFT_TaskTrigger",
  // "MSFT_TaskDailyTrigger") como descrição — traduz para o rótulo legível.
  const rawClass = /^MSFT_Task([A-Za-z]*)Trigger$/.exec(desc.trim());
  if (rawClass) {
    return scheduledTaskTriggerLabel(rawClass[1].toLowerCase());
  }

  return desc
    .replace(/\bDiario\b/gi, "Diário")
    .replace(/\bCalendario\b/gi, "Calendário")
    .replace(/\bMudanca\b/gi, "Mudança")
    .replace(/\bsessao\b/gi, "sessão")
    .replace(/\binicializacao\b/gi, "inicialização")
    .replace(/\bexecucao\b/gi, "execução")
    .replace(/\b as (\d{2}:\d{2})\b/gi, " às $1");
}

export function scheduledTaskStateColor(
  state: string | null,
): "success" | "danger" | "slate" {
  if (!state) return "slate";
  return state.toLowerCase() === "disabled" ? "danger" : "success";
}

/**
 * Rótulo do último resultado (HRESULT) de uma tarefa agendada.
 * 0 é sucesso; os demais valores são exibidos como código numérico.
 */
export function scheduledTaskLastResultLabel(
  result: number | null | undefined,
): string {
  if (result === null || result === undefined || Number.isNaN(result)) return "—";
  if (result === 0) return "Sucesso (0)";
  return `Código ${result}`;
}


export interface AgentCommandOutcome {
  ok: boolean;
  message: string;
}

/** Status terminais do comando (nada mais vai chegar do agent). "deferred" é
 * o status novo da API para comandos adiado pelo agent. */
const TERMINAL_COMMAND_STATUSES = new Set(["completed", "failed", "cancelled", "timeout", "deferred"]);

/** Mensagem enquanto o agent ainda não respondeu (pending/sent/running). */
const PENDING_COMMAND_OUTCOME: AgentCommandOutcome = {
  ok: true,
  message: "Comando enviado ao agent — o resultado aparece quando o agent responder.",
};

/**
 * Status da saída JSON declarativa do comando de power — contrato de UMA linha
 * que agora é a fonte de verdade nas 3 camadas (agent Go, API C#, Site):
 *   {"status":"executed"|"scheduled"|"deferred_by_user"|"deferred_to_window"|"denied"|"failed", ...}
 * Exit codes mantidos: executed/scheduled/deferred_*=0; denied=10; failed=1 —
 * então status/exit code sozinhos mentem: o output é quem descreve o desfecho.
 */
export type AgentPowerStatus =
  | "executed"
  | "scheduled"
  | "deferred_by_user"
  | "deferred_to_window"
  | "denied"
  | "failed";

const POWER_OUTPUT_STATUS_VALUES = new Set<string>([
  "executed",
  "scheduled",
  "deferred_by_user",
  "deferred_to_window",
  "denied",
  "failed",
]);

interface AgentPowerOutput {
  status: AgentPowerStatus | null;
  action: string | null;
  message: string | null;
  delaySeconds: number | null;
  defer: { current: number | null; max: number | null; minutes: number | null } | null;
  nextRunAt: string | null;
}

const EMPTY_POWER_OUTPUT: AgentPowerOutput = {
  status: null,
  action: null,
  message: null,
  delaySeconds: null,
  defer: null,
  nextRunAt: null,
};

/** Extrai o primeiro objeto JSON válido do output (JSON puro ou embutido no texto). */
function parseEmbeddedJson(result: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(result);
    if (isRecord(parsed)) return parsed;
  } catch {
    // Não é JSON puro — procura um objeto embutido no texto.
  }
  const start = result.indexOf("{");
  const end = result.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(result.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Extrai o nextRunAt do output do agent: JSON do contrato, JSON embutido ou
 * marcador textual legado (`nextRunAt=...`), null quando ausente/ilegível. */
export function extractDeferredNextRunAt(result: string | null | undefined): string | null {
  if (!result) return null;
  const parsed = parseEmbeddedJson(result);
  if (parsed) {
    const nextRunAt = parsed.nextRunAt ?? parsed.next_run_at;
    if (typeof nextRunAt === "string" && nextRunAt.trim()) return nextRunAt;
    if (typeof nextRunAt === "number" && Number.isFinite(nextRunAt)) return String(nextRunAt);
    return null;
  }
  // Textual legado: "deferred_to_window nextRunAt=2026-11-03T05:00:00Z"
  const match = /next_?run_?at\s*[=:]\s*"?(?<when>[^"\s,;}]+)"?/i.exec(result);
  return match?.groups?.when ?? null;
}

function describeDeferredMessage(result: string): string {
  const nextRunAt = extractDeferredNextRunAt(result);
  if (!nextRunAt) {
    return "Comando aceito, mas adiado para a janela de manutenção. Nada foi executado na máquina.";
  }
  const parsed = new Date(nextRunAt);
  const when = Number.isNaN(parsed.getTime()) ? nextRunAt : formatDateTimeCanonical(nextRunAt);
  return `Comando aceito, mas adiado para a janela de manutenção (executa em ${when}). Nada foi executado na máquina.`;
}

/**
 * Lê o output do comando e devolve o status do contrato. Fontes, em ordem:
 * 1. JSON do contrato (puro ou embutido no texto);
 * 2. marcadores textuais case-insensitive de agents antigos ("deferred_to_window",
 *    "adiado pelo usuário", "agendado silenciosamente" — diacríticos ignorados,
 *    pois o output do PowerShell pode chegar corrompido pela code page OEM);
 * 3. nada reconhecido → null (a classificação cai no status/exit code).
 */
function parsePowerOutput(result: string): AgentPowerOutput {
  if (!result) return EMPTY_POWER_OUTPUT;
  const parsed = parseEmbeddedJson(result);
  if (parsed) {
    const rawStatus = typeof parsed.status === "string" ? parsed.status.trim().toLowerCase() : "";
    if (rawStatus && POWER_OUTPUT_STATUS_VALUES.has(rawStatus)) {
      const deferRaw = isRecord(parsed.defer) ? parsed.defer : {};
      const current = typeof deferRaw.current === "number" ? deferRaw.current : null;
      const max = typeof deferRaw.max === "number" ? deferRaw.max : null;
      const minutes = typeof deferRaw.minutes === "number" ? deferRaw.minutes : null;
      const nextRunAtRaw = parsed.nextRunAt ?? parsed.next_run_at;
      return {
        status: rawStatus as AgentPowerStatus,
        action: typeof parsed.action === "string" ? parsed.action : null,
        message: typeof parsed.message === "string" ? parsed.message : null,
        delaySeconds: typeof parsed.delaySeconds === "number" ? parsed.delaySeconds : null,
        defer:
          current !== null || max !== null || minutes !== null
            ? { current, max, minutes }
            : null,
        nextRunAt:
          typeof nextRunAtRaw === "string" && nextRunAtRaw.trim() ? nextRunAtRaw.trim() : null,
      };
    }
  }
  const normalized = result
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("deferred_to_window")) {
    return { ...EMPTY_POWER_OUTPUT, status: "deferred_to_window" };
  }
  if (normalized.includes("adiado pelo usuario")) {
    return { ...EMPTY_POWER_OUTPUT, status: "deferred_by_user" };
  }
  if (normalized.includes("agendado silenciosamente")) {
    return { ...EMPTY_POWER_OUTPUT, status: "scheduled" };
  }
  return EMPTY_POWER_OUTPUT;
}

function describeFailedOutcome(
  exitCode: number | null,
  errorMessage: string | null | undefined,
): AgentCommandOutcome {
  const exitInfo = exitCode !== null && exitCode !== 0 ? `Código de saída ${exitCode}. ` : "";
  const detail = errorMessage?.trim();
  const detailInfo = detail ? `${detail} ` : "";
  return {
    ok: false,
    message: `O agent não conseguiu concluir a ação. ${exitInfo}${detailInfo}Verifique os logs do agent ou tente novamente (algumas ações exigem privilégio administrativo).`,
  };
}

/**
 * Traduz o comando devolvido pela API no desfecho exibível ao operador.
 * Classifica PRIMEIRO pelo JSON de status do contrato; deferral/denial nunca
 * viram "sucesso", mesmo com exit code 0 (confirmação antecipada do agent).
 */
export function describeAgentCommandOutcome(command: {
  status?: string | null;
  result?: string | null;
  exitCode?: number | null;
  errorMessage?: string | null;
}): AgentCommandOutcome {
  const status = String(command.status ?? "").toLowerCase();
  const result = command.result ?? "";
  const exitCode = command.exitCode ?? null;
  const info = parsePowerOutput(result);

  switch (info.status) {
    case "executed":
      return { ok: true, message: "Ação executada com sucesso no agent." };
    case "scheduled": {
      const delay = info.delaySeconds !== null ? ` (${info.delaySeconds} s)` : "";
      return {
        ok: true,
        message: `Comando aceito — a ação foi agendada e ainda não foi executada${delay}.`,
      };
    }
    case "deferred_by_user": {
      const defer = info.defer;
      if (defer && defer.current !== null && defer.max !== null) {
        const minutes = defer.minutes !== null ? `, ${defer.minutes} min` : "";
        return {
          ok: false,
          message: `Adiado pelo usuário (${defer.current}/${defer.max}${minutes}) — nada foi executado agora.`,
        };
      }
      return { ok: false, message: "Adiado pelo usuário — nada foi executado agora." };
    }
    case "deferred_to_window":
      return { ok: false, message: describeDeferredMessage(result) };
    case "denied":
      return { ok: false, message: "O usuário negou a ação." };
    case "failed":
      return describeFailedOutcome(exitCode, command.errorMessage);
  }

  // Status "deferred" (novo) sem output legível: terminal e NÃO é sucesso.
  if (status === "deferred") {
    return { ok: false, message: "Comando adiado pelo agent — nada foi executado agora." };
  }

  if (status === "completed" && (exitCode === null || exitCode === 0)) {
    return { ok: true, message: "Ação executada com sucesso no agent." };
  }

  if (status === "failed" || status === "cancelled" || status === "timeout" || (exitCode !== null && exitCode !== 0)) {
    return describeFailedOutcome(exitCode, command.errorMessage);
  }

  return { ...PENDING_COMMAND_OUTCOME };
}

/**
 * Aguarda o resultado de um comando despachado ao agent (StartupItem/
 * ScheduledTask): faz polling do histórico de comandos até que o comando
 * mais recente do tipo informado saia de Pending/Sent/Running ou até
 * esgotar o timeout (~20s). A mensagem é derivada de status + result +
 * exitCode (o DTO expõe os três), para que adiamento/negativa não sejam
 * reportados como sucesso.
 */
export async function awaitAgentCommandResult(
  agentId: string,
  commandType: "StartupItem" | "ScheduledTask",
  dispatchedAt: Date,
  maxAttempts = 10,
): Promise<AgentCommandOutcome> {
  const { agentsApi } = await import("@/api");
  const startedMs = dispatchedAt.getTime() - 2000;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const commands = await agentsApi.listCommands(agentId, 30);
      const candidates = commands.filter((cmd) => {
        const createdAt = new Date(cmd.createdAt).getTime();
        const typeMatches = String(cmd.commandType ?? "")
          .toLowerCase()
          .includes(commandType.toLowerCase());
        return createdAt >= startedMs && typeMatches;
      });
      if (candidates.length === 0) continue;
      const latest = candidates[0];
      const status = String(latest.status ?? "").toLowerCase();
      if (TERMINAL_COMMAND_STATUSES.has(status)) {
        return describeAgentCommandOutcome(latest);
      }
      // Pending/Sent/Running — continua aguardando
    } catch {
      // Falha transitória de rede — tenta novamente
    }
  }
  return { ...PENDING_COMMAND_OUTCOME };
}

/** Intervalo entre consultas do histórico no polling por commandId. */
export const AGENT_COMMAND_POLL_INTERVAL_MS = 2000;
/** Tentativas do polling por commandId (~20s no total). */
export const AGENT_COMMAND_MAX_ATTEMPTS = 10;

export interface AwaitAgentCommandOptions {
  maxAttempts?: number;
  pollIntervalMs?: number;
}

/**
 * Helper ÚNICO de desfecho por commandId — usado pelo fluxo de power em
 * AgentContextMenu, AgentList e AgentDetail (não duplicar esse polling).
 * Após o POST de restart/shutdown (a API agora devolve commandId), consulta
 * agentsApi.listCommands até o comando com aquele id ficar terminal (~10×2s)
 * e devolve o desfecho classificado. Sem commandId (API antiga) ou esgotado o
 * polling, devolve o desfecho "Comando enviado…" — nunca inventa resultado.
 */
export async function awaitAgentCommandById(
  agentId: string,
  commandId: string | null | undefined,
  options?: AwaitAgentCommandOptions,
): Promise<AgentCommandOutcome> {
  if (!commandId) return { ...PENDING_COMMAND_OUTCOME };
  const { agentsApi } = await import("@/api");
  const maxAttempts = options?.maxAttempts ?? AGENT_COMMAND_MAX_ATTEMPTS;
  const pollIntervalMs = options?.pollIntervalMs ?? AGENT_COMMAND_POLL_INTERVAL_MS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    try {
      const commands = await agentsApi.listCommands(agentId, 30);
      const command = commands.find((cmd) => cmd.id === commandId);
      if (!command) continue;
      const commandStatus = String(command.status ?? "").toLowerCase();
      if (TERMINAL_COMMAND_STATUSES.has(commandStatus)) {
        return describeAgentCommandOutcome(command);
      }
      // Pending/Sent/Running — continua aguardando
    } catch {
      // Falha transitória de rede — tenta novamente
    }
  }
  return { ...PENDING_COMMAND_OUTCOME };
}

/** Toast único do desfecho: verde para ok, vermelho para o resto. */
export function notifyAgentCommandOutcome(outcome: AgentCommandOutcome): void {
  if (outcome.ok) toast.success(outcome.message);
  else toast.error(outcome.message);
}

export function nodeLinkStatusColor(
  status: string,
): "success" | "warning" | "danger" | "accent" | "slate" {
  const normalized = status.toLowerCase();
  if (normalized === "verified") return "success";
  if (normalized === "linked") return "accent";
  if (normalized === "suggested") return "warning";
  if (normalized === "ambiguous" || normalized === "error") return "danger";
  return "slate";
}

// ── Navegação entre abas de dados do agente (deep link via ?tab=) ────────

export type AgentDetailDataTab =
  | "info"
  | "customFields"
  | "notes"
  | "labelHistory"
  | "software"
  | "printers"
  | "tickets"
  | "network"
  | "autostart"
  | "windowsUpdates"
  | "policies"
  | "logs";

/**
 * Sub-abas da aba unificada "Rede": adaptadores, portas em escuta e conexões
 * abertas descrevem o mesmo assunto (a rede do host) e ficam agrupados para
 * não inflar a barra principal de abas.
 */
export type AgentNetworkView = "adapters" | "listeningPorts" | "openSockets";

/**
 * Sub-abas da aba unificada "Autoruns": itens de inicialização
 * (registro, pastas Startup e serviços automáticos) e tarefas agendadas do
 * Windows descrevem o mesmo assunto — o que o host executa sozinho, sem
 * intervenção do operador. Ficam agrupados na mesma aba, como já acontece com
 * as sub-abas de rede.
 */
export type AgentAutostartView = "startupItems" | "scheduledTasks";

/**
 * Aba inicial do detalhe: "Info" concentra os dados cadastrais do host e as
 * anotações fixadas — é a primeira coisa que o operador precisa ver.
 */
export const AGENT_DETAIL_DEFAULT_TAB: AgentDetailDataTab = "info";

/**
 * Slugs legíveis usados na querystring (?tab=aplicativos, ?tab=anotacoes...).
 * Mantê-los estáveis preserva links compartilhados e deep links.
 */
export const AGENT_DETAIL_TAB_SLUGS: Record<AgentDetailDataTab, string> = {
  info: "info",
  customFields: "campos-customizados",
  notes: "anotacoes",
  labelHistory: "historico-de-labels",
  software: "aplicativos",
  printers: "impressoras",
  tickets: "ultimos-chamados",
  network: "rede",
  autostart: "execucao-automatica",
  windowsUpdates: "atualizacoes",
  policies: "politicas",
  logs: "logs",
};

/**
 * Slugs das sub-abas de rede. Os dois últimos eram abas de topo antes da
 * unificação e continuam válidos como deep link (caem na sub-aba correta).
 */
export const AGENT_NETWORK_VIEW_SLUGS: Record<AgentNetworkView, string> = {
  adapters: "rede",
  listeningPorts: "portas-em-escuta",
  openSockets: "conexoes-abertas",
};

export const AGENT_NETWORK_DEFAULT_VIEW: AgentNetworkView = "adapters";

const AGENT_NETWORK_VIEW_BY_SLUG = new Map<string, AgentNetworkView>(
  (Object.entries(AGENT_NETWORK_VIEW_SLUGS) as [AgentNetworkView, string][]).map(
    ([view, slug]) => [slug, view],
  ),
);

/**
 * Slugs das sub-abas de "Autoruns". Os dois eram abas de topo antes
 * da unificação e continuam válidos como deep link (caem na sub-aba correta).
 */
export const AGENT_AUTOSTART_VIEW_SLUGS: Record<AgentAutostartView, string> = {
  startupItems: "inicializacao",
  scheduledTasks: "tarefas-agendadas",
};

export const AGENT_AUTOSTART_DEFAULT_VIEW: AgentAutostartView = "startupItems";

const AGENT_AUTOSTART_VIEW_BY_SLUG = new Map<string, AgentAutostartView>(
  (Object.entries(AGENT_AUTOSTART_VIEW_SLUGS) as [AgentAutostartView, string][]).map(
    ([view, slug]) => [slug, view],
  ),
);

const AGENT_DETAIL_TAB_BY_SLUG = new Map<string, AgentDetailDataTab>(
  (Object.entries(AGENT_DETAIL_TAB_SLUGS) as [AgentDetailDataTab, string][]).map(
    ([tab, slug]) => [slug, tab],
  ),
);

/** Resolve o slug da URL para uma aba válida; cai no padrão quando desconhecido. */
export function agentDetailTabFromSlug(
  slug: string | null | undefined,
): AgentDetailDataTab {
  if (!slug) return AGENT_DETAIL_DEFAULT_TAB;
  const normalized = slug.trim().toLowerCase();
  const tab = AGENT_DETAIL_TAB_BY_SLUG.get(normalized);
  if (tab) return tab;
  // Slugs legados das abas de rede agora apontam para a aba unificada "Rede".
  if (AGENT_NETWORK_VIEW_BY_SLUG.has(normalized)) return "network";
  // Idem para "Inicialização" e "Tarefas Agendadas": as duas viraram sub-abas
  // de "Autoruns", mas os deep links antigos seguem válidos.
  if (AGENT_AUTOSTART_VIEW_BY_SLUG.has(normalized)) return "autostart";
  return AGENT_DETAIL_DEFAULT_TAB;
}

/** Slug canônico de uma sub-aba de rede — usado ao montar a URL (?tab=...). */
export function agentNetworkViewSlug(view: AgentNetworkView): string {
  return AGENT_NETWORK_VIEW_SLUGS[view];
}

/**
 * Resolve a sub-aba de rede a partir do slug. Aceita tanto o slug canônico da
 * aba ("rede") quanto os slugs legados de portas/conexões; desconhecidos caem
 * em "adapters".
 */
export function agentNetworkViewFromSlug(
  slug: string | null | undefined,
): AgentNetworkView {
  if (!slug) return AGENT_NETWORK_DEFAULT_VIEW;
  return AGENT_NETWORK_VIEW_BY_SLUG.get(slug.trim().toLowerCase()) ?? AGENT_NETWORK_DEFAULT_VIEW;
}

/** Slug canônico de uma sub-aba de "Autoruns" (?tab=...). */
export function agentAutostartViewSlug(view: AgentAutostartView): string {
  return AGENT_AUTOSTART_VIEW_SLUGS[view];
}

/**
 * Resolve a sub-aba de "Autoruns" a partir do slug. Aceita o slug
 * canônico da aba ("execucao-automatica") e os slugs legados "inicializacao" e
 * "tarefas-agendadas"; desconhecidos caem em "startupItems".
 */
export function agentAutostartViewFromSlug(
  slug: string | null | undefined,
): AgentAutostartView {
  if (!slug) return AGENT_AUTOSTART_DEFAULT_VIEW;
  return (
    AGENT_AUTOSTART_VIEW_BY_SLUG.get(slug.trim().toLowerCase()) ??
    AGENT_AUTOSTART_DEFAULT_VIEW
  );
}

/** Slug canônico de uma aba — usado ao montar a URL. */
export function agentDetailTabSlug(tab: AgentDetailDataTab): string {
  return AGENT_DETAIL_TAB_SLUGS[tab];
}

// ── Voltar do detalhe do agente ─────────────────────────────────────────

/** Rota usada quando não há uma página anterior real para onde voltar. */
export const AGENT_DETAIL_FALLBACK_ROUTE = "/agents";

/**
 * Decide o destino do botão "Voltar" do cabeçalho do detalhe do agente.
 *
 * Retorna `null` quando existe uma página anterior real dentro do app — nesse
 * caso o chamador deve usar `navigate(-1)` para preservar o contexto de origem
 * (listagem, cliente, site, inventário de software...). Retorna a rota de
 * fallback (listagem de agentes) quando o detalhe é a primeira entrada do
 * histórico, como em link direto, refresh ou nova aba.
 *
 * `historyIndex` é o `window.history.state.idx` mantido pelo React Router:
 * `0` (ou ausente) significa que não há entrada anterior dentro do app.
 * A navegação entre abas do detalhe não conta, porque a troca de aba usa
 * `replace` e portanto não empilha entradas no histórico.
 */
export function agentDetailBackTarget(
  historyIndex: number | null | undefined,
): string | null {
  if (typeof historyIndex === "number" && historyIndex > 0) return null;
  return AGENT_DETAIL_FALLBACK_ROUTE;
}
