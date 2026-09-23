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
  if (!bytes) return "\u2014";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

export function formatDate(date: string | null): string {
  if (!date) return "\u2014";
  return new Date(date).toLocaleString("pt-BR");
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


export interface AgentCommandOutcome {
  ok: boolean;
  message: string;
}

/**
 * Aguarda o resultado de um comando despachado ao agent (StartupItem/
 * ScheduledTask): faz polling do histórico de comandos até que o comando
 * mais recente do tipo informado saia de Pending/Sent/Running ou até
 * esgotar o timeout (~20s). O DTO de comandos não expõe result, então a
 * mensagem é derivada do status final.
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
      if (status === "completed") {
        return { ok: true, message: "Ação executada com sucesso no agent." };
      }
      if (status === "failed" || status === "cancelled" || status === "timeout") {
        return {
          ok: false,
          message:
            "O agent não conseguiu concluir a ação. Verifique os logs do agent ou tente novamente (algumas ações exigem privilégio administrativo).",
        };
      }
      // Pending/Sent/Running — continua aguardando
    } catch {
      // Falha transitória de rede — tenta novamente
    }
  }
  return {
    ok: true,
    message: "Comando enviado ao agent — o resultado aparece quando o agent responder.",
  };
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
  | "software"
  | "printers"
  | "tickets"
  | "listeningPorts"
  | "openSockets"
  | "startupItems"
  | "scheduledTasks"
  | "logs";

export const AGENT_DETAIL_DEFAULT_TAB: AgentDetailDataTab = "software";

/**
 * Slugs legíveis usados na querystring (?tab=aplicativos, ?tab=tarefas-agendadas...).
 * Mantê-los estáveis preserva links compartilhados e deep links.
 */
export const AGENT_DETAIL_TAB_SLUGS: Record<AgentDetailDataTab, string> = {
  software: "aplicativos",
  printers: "impressoras",
  tickets: "ultimos-chamados",
  listeningPorts: "portas-em-escuta",
  openSockets: "conexoes-abertas",
  startupItems: "inicializacao",
  scheduledTasks: "tarefas-agendadas",
  logs: "logs",
};

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
  return AGENT_DETAIL_TAB_BY_SLUG.get(slug.trim().toLowerCase()) ?? AGENT_DETAIL_DEFAULT_TAB;
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
