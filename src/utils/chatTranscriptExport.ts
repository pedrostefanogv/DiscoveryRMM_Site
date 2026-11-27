import type { TicketChatMessage, TicketChatSession } from "@/api/ticket-chat";
import { triggerBlobDownload } from "./chatAttachment";

export type TranscriptFormat = "md" | "txt";

function formatIso(raw?: string | null): string {
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("pt-BR");
}

function authorLabel(msg: TicketChatMessage): string {
  const kind = String(msg.authorKind).toLowerCase();
  if (kind === "system") return "Sistema";
  if (msg.authorName && msg.authorName.trim()) return msg.authorName.trim();
  return kind === "support" ? "Suporte" : "Usuário";
}

export function buildChatTranscript(
  session: TicketChatSession,
  messages: TicketChatMessage[],
  format: TranscriptFormat = "md",
): string {
  const lines: string[] = [];

  if (format === "md") {
    lines.push(`# Transcrição do Chat de Suporte`);
    lines.push("");
    lines.push(`- **Sessão:** \`${session.id}\``);
    if (session.ticketId) lines.push(`- **Chamado:** \`${session.ticketId}\``);
    lines.push(`- **Status:** ${session.status}`);
    if (session.startedByName) lines.push(`- **Atendente:** ${session.startedByName}`);
    lines.push(`- **Iniciada em:** ${formatIso(session.startedAt)}`);
    if (session.endedAt) lines.push(`- **Encerrada em:** ${formatIso(session.endedAt)}`);
    if (session.endReason) lines.push(`- **Motivo:** ${session.endReason}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  } else {
    lines.push("TRANSCRIÇÃO DO CHAT DE SUPORTE");
    lines.push(`Sessão: ${session.id}`);
    if (session.ticketId) lines.push(`Chamado: ${session.ticketId}`);
    lines.push(`Status: ${session.status}`);
    if (session.startedByName) lines.push(`Atendente: ${session.startedByName}`);
    lines.push(`Iniciada em: ${formatIso(session.startedAt)}`);
    if (session.endedAt) lines.push(`Encerrada em: ${formatIso(session.endedAt)}`);
    lines.push("----------------------------------------");
  }

  for (const msg of messages) {
    const time = formatIso(msg.createdAt);
    const author = authorLabel(msg);
    const body = (msg.body ?? "").trim();

    if (format === "md") {
      lines.push(`**[${time}] ${author}:**`);
      if (body) lines.push(body);
      if (msg.attachments?.length) {
        const names = msg.attachments.map((a) => `\`${a.fileName}\``).join(", ");
        lines.push(`_Anexos:_ ${names}`);
      }
      lines.push("");
    } else {
      lines.push(`[${time}] ${author}: ${body}`);
      if (msg.attachments?.length) {
        const names = msg.attachments.map((a) => a.fileName).join(", ");
        lines.push(`  Anexos: ${names}`);
      }
    }
  }

  return lines.join("\n");
}

export function exportChatTranscript(
  session: TicketChatSession,
  messages: TicketChatMessage[],
  format: TranscriptFormat = "md",
): void {
  const content = buildChatTranscript(session, messages, format);
  const mime = format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
  const blob = new Blob([content], { type: mime });
  const shortId = session.id.slice(0, 8);
  triggerBlobDownload(blob, `chat-suporte-${shortId}.${format}`);
}
