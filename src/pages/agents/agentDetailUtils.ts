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
    default:
      return triggerType || "Outro";
  }
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
