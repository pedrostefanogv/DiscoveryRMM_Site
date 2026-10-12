import { describe, expect, it } from "vitest";

// Guarda de regressão (fonte): a mensagem de SISTEMA do encerramento
// ("Chat de suporte encerrado pelo suporte/usuário", gravada pelo servidor)
// precisa aparecer como NOTA centralizada — não como fala de quem não a
// escreveu — e a thread não pode sumir quando a sessão termina.
//
// Sem isso o operador via a conversa esvaziar (a sessão sai da consulta de
// "sessão corrente" ao encerrar) e, no histórico, a nota de sistema era
// renderizada como se o suporte tivesse dito aquilo.
//
// Fontes lidas via import.meta.glob (Vite): o tsconfig do app não expõe as
// APIs de Node para os testes.
const SOURCES = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(name: string): string {
  const entry = Object.entries(SOURCES).find(([path]) => path.endsWith(name));
  if (!entry) throw new Error('fonte não encontrada: ' + name);
  return entry[1];
}

describe("chat do chamado — mensagens de sistema e fim de conversa", () => {
  it("a janela ao vivo mantém a thread visível depois do encerramento", () => {
    const panel = source("SupportChatPanel.tsx");
    expect(panel).toContain("lastSession");
    expect(panel).toContain("sessionEnded");
    // Nota de sistema centralizada, não bolha de conversa.
    expect(panel).toContain('toLowerCase() === "system"');
  });

  it("desabilita o campo de texto e o Enviar quando a conversa termina", () => {
    const panel = source("SupportChatPanel.tsx");
    // O último snapshot da sessão chega com status "Active": sem normalizar para
    // "Ended", o compositor continuava utilizável numa conversa encerrada.
    expect(panel).toContain('session?.status === "Active"');
    expect(panel).toContain("const sessionForUi = sessionEnded");
    expect(panel).toContain('status: "Ended"');
    expect(panel).toContain("const canSend = sessionForUi?.status");
  });

  it("mostra a causa devolvida pela API nas falhas de anexo/envio", () => {
    const panel = source("SupportChatPanel.tsx");
    expect(panel).toContain("function describeError(");
    expect(panel).toContain("describeError(error");
  });

  it("o histórico somente-leitura também renderiza a nota de sistema", () => {
    const history = source("TicketChatHistory.tsx");
    expect(history).toContain('toLowerCase() === "system"');
  });
});
