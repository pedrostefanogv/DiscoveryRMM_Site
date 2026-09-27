import type { AppNotification } from "@/api/notifications";

export interface NavigationTarget {
  path: string;
  label: string;
  ticketId?: string;
  ticketTitle?: string;
}

const GUID_PATTERN =
  /#?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

function readText(
  source: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Extrai o destino de navegação do payload da notificação. O backend passou a
 * devolver `payloadJson` na listagem, então a navegação funciona também após
 * recarregar a página (antes só os eventos em tempo real tinham payload).
 */
export function parseNavigationTarget(
  payloadJson: string | null | undefined,
): NavigationTarget | null {
  if (!payloadJson) return null;

  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;

    const ticketId = readText(parsed, "ticketId", "ticket_id");
    const agentId = readText(parsed, "agentId", "agent_id");
    const clientId = readText(parsed, "clientId", "client_id");
    const ticketTitle = readText(parsed, "ticketTitle", "ticket_title");

    if (ticketId) {
      return { path: `/tickets/${ticketId}`, label: "chamado", ticketId, ticketTitle };
    }
    if (agentId) return { path: `/agents/${agentId}`, label: "agente" };
    if (clientId) return { path: `/clients/${clientId}`, label: "cliente" };

    return null;
  } catch {
    return null;
  }
}

/** Referência curta de chamado, no mesmo formato da lista de chamados (#8 chars). */
export function shortTicketRef(ticketId: string | null | undefined): string | null {
  if (!ticketId) return null;
  const normalized = ticketId.trim();
  if (!normalized) return null;
  return `#${normalized.slice(0, 8)}`;
}

/** Substitui GUIDs completos por referências curtas em textos legados. */
export function sanitizeTicketIds(text: string): string {
  return text.replace(GUID_PATTERN, (_match, guid: string) => `#${guid.slice(0, 8)}`);
}

/**
 * Monta o texto exibido no card. Quando o payload traz o título do chamado e a
 * mensagem não o contém (dados antigos), usa o título em vez do ID.
 */
export function formatNotificationMessage(
  item: Pick<AppNotification, "message" | "payloadJson">,
): string {
  const message = item.message ?? "";
  const ticketTitle = parseNavigationTarget(item.payloadJson)?.ticketTitle;

  if (ticketTitle && !message.includes(ticketTitle)) {
    const suffix = message ? ` — ${sanitizeTicketIds(message)}` : "";
    return `Chamado "${ticketTitle}"${suffix}`;
  }

  return sanitizeTicketIds(message);
}
