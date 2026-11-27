import { describe, expect, it } from "vitest";
import type { TicketChatMessage, TicketChatSession } from "@/api/ticket-chat";
import { buildChatTranscript } from "./chatTranscriptExport";

const baseSession: TicketChatSession = {
  id: "11111111-2222-3333-4444-555555555555",
  ticketId: "aaaa1111-2222-3333-4444-555555555555",
  agentId: "bbbb1111-2222-3333-4444-555555555555",
  status: "Ended",
  startedByName: "Pedro",
  startedAt: "2026-11-27T13:00:00Z",
  endedAt: "2026-11-27T13:15:00Z",
  endReason: "support_closed",
  messageCount: 2,
};

const sampleMessages: TicketChatMessage[] = [
  {
    id: "m1",
    sequenceNumber: 1,
    authorKind: "Support",
    authorName: "Pedro",
    body: "Olá, qual o problema?",
    createdAt: "2026-11-27T13:01:00Z",
    attachments: [],
  },
  {
    id: "m2",
    sequenceNumber: 2,
    authorKind: "EndUser",
    authorName: "Maria",
    body: "Erro no sistema.",
    createdAt: "2026-11-27T13:02:00Z",
    attachments: [
      {
        id: "a1",
        fileName: "print.png",
        contentType: "image/png",
        sizeBytes: 1234,
      },
    ],
  },
];

describe("buildChatTranscript", () => {
  it("gera transcrição em Markdown com metadados e anexos", () => {
    const md = buildChatTranscript(baseSession, sampleMessages, "md");
    expect(md).toContain("# Transcrição do Chat de Suporte");
    expect(md).toContain("Pedro");
    expect(md).toContain("Olá, qual o problema?");
    expect(md).toContain("`print.png`");
  });

  it("gera transcrição em texto puro", () => {
    const txt = buildChatTranscript(baseSession, sampleMessages, "txt");
    expect(txt).toContain("TRANSCRIÇÃO DO CHAT DE SUPORTE");
    expect(txt).toContain("Maria: Erro no sistema.");
    expect(txt).toContain("Anexos: print.png");
  });
});
