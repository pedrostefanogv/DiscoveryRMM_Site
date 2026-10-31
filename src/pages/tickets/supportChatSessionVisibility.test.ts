import { describe, expect, it } from "vitest";
import type { TicketChatSession } from "@/api/ticket-chat";
import {
  isLiveSupportChatStatus,
  shouldAdoptSupportChatSession,
} from "./supportChatSessionVisibility";

// Guarda de regressão da regra de EXIBIÇÃO da sessão no painel de chat de
// suporte: abrir a janela NÃO pode ressuscitar a última conversa TERMINAL da
// máquina (era o histórico de outro atendente/turno aparecendo para quem só
// queria iniciar um chat novo). Sessão ao vivo entra sempre; terminal só entra
// se for a MESMA sessão que a janela já acompanhava (o desfecho chega nela).
function session(status: string, id = "s-" + status): TicketChatSession {
  return { id, status } as unknown as TicketChatSession;
}

describe("adoção de sessão no painel de chat de suporte", () => {
  it("sessão ao vivo (Pending/Active) entra sempre, mesmo sem histórico local", () => {
    expect(isLiveSupportChatStatus("Pending")).toBe(true);
    expect(isLiveSupportChatStatus("Active")).toBe(true);
    expect(isLiveSupportChatStatus("Ended")).toBe(false);
    expect(isLiveSupportChatStatus("Declined")).toBe(false);
    expect(isLiveSupportChatStatus("Expired")).toBe(false);
    expect(isLiveSupportChatStatus(undefined)).toBe(false);
    expect(isLiveSupportChatStatus(null)).toBe(false);

    expect(shouldAdoptSupportChatSession(session("Pending"), null)).toBe(true);
    expect(shouldAdoptSupportChatSession(session("Active"), null)).toBe(true);
  });

  it("sessão terminal recebida ao abrir do zero NÃO é adotada (sem histórico antigo)", () => {
    expect(shouldAdoptSupportChatSession(session("Ended"), null)).toBe(false);
    expect(shouldAdoptSupportChatSession(session("Declined"), null)).toBe(false);
    expect(shouldAdoptSupportChatSession(session("Expired"), null)).toBe(false);
    expect(shouldAdoptSupportChatSession(null, null)).toBe(false);
  });

  it("a MESMA sessão que a janela já acompanhava continua visível após o desfecho", () => {
    const known = session("Active", "s1");
    // Desfecho chegando para a sessão que a janela abriu/acompanhava.
    expect(shouldAdoptSupportChatSession(session("Ended", "s1"), known)).toBe(true);
    expect(shouldAdoptSupportChatSession(session("Declined", "s1"), known)).toBe(true);
    // Outra sessão terminal (conversa anterior de outro atendente) não entra.
    expect(shouldAdoptSupportChatSession(session("Ended", "s2"), known)).toBe(false);
  });
});
